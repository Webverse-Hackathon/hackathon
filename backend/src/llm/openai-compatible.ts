/**
 * An adapter for OpenAI-compatible chat-completions APIs: OpenRouter, Groq, and
 * anything else that speaks POST /chat/completions with function tools
 * (DECISIONS.md #15). Plain fetch, no SDK.
 *
 * Like the Anthropic adapter it maps whole text-only ModelRequests (#11). There
 * is no image content type in this file, by design (P-2).
 */

import {
  LlmError,
  emptyUsage,
  type LlmProvider,
  type ModelRequest,
  type ModelResponse,
  type ModelToolCall,
} from './provider.js';

export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface OpenAiCompatibleOptions {
  apiKey: string;
  /** e.g. https://openrouter.ai/api/v1 */
  baseURL: string;
  /**
   * One model id, or a comma-separated fallback list tried in order when a model is
   * overloaded or rate limited (free endpoints often are). On OpenRouter the list is
   * also sent as `models`, so its router falls through server-side.
   */
  decideModel: string;
  narrateModel: string;
  /** Sent as OpenRouter's `reasoning: { effort }` on openrouter.ai, `reasoning_effort` elsewhere. Omitted when null. */
  reasoningEffort: ReasoningEffort | null;
  timeoutMs: number;
  /** Retries for 429 and 5xx, with backoff. */
  maxRetries: number;
  fetch?: typeof fetch;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletion {
  model?: string;
  choices?: {
    finish_reason?: string | null;
    message?: { content?: string | null; tool_calls?: { type?: string; function?: { name?: string; arguments?: string } }[] };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  error?: { message?: string; code?: number | string };
  /** NVIDIA NIM reports failures as RFC 7807 problem details, not `error`. */
  detail?: string;
}

/** Reasoning models spend output tokens thinking before they answer; a tiny cap leaves no answer. */
const MIN_MAX_TOKENS = 2000;

function toMessages(request: ModelRequest): ChatMessage[] {
  const system = request.system.map((block) => block.text).join('\n\n');
  return [
    ...(system ? [{ role: 'system' as const, content: system }] : []),
    ...request.messages.map((message) => ({ role: message.role, content: message.content.map((block) => block.text).join('\n\n') })),
  ];
}

function parseToolCalls(completion: ChatCompletion): ModelToolCall[] {
  const calls = completion.choices?.[0]?.message?.tool_calls ?? [];
  const parsed: ModelToolCall[] = [];
  for (const call of calls) {
    const name = call.function?.name;
    if (!name) continue;
    try {
      parsed.push({ name, input: JSON.parse(call.function?.arguments || '{}') as unknown });
    } catch {
      // Malformed arguments: leave the call out, so the loop's correction path asks again.
    }
  }
  return parsed;
}

/**
 * Some open models ignore tool_choice and write the call as JSON in the reply,
 * e.g. `[{"name": "press_key", "parameters": {...}}]`, sometimes fenced or wrapped
 * in extra brackets. Recover the first such call. It is still validated strictly by
 * agent/tools.ts, so this cannot smuggle in anything a real tool call could not.
 */
export function toolCallsFromText(text: string, toolNames: readonly string[]): ModelToolCall[] {
  const names = new Set(toolNames);
  const candidates: unknown[] = [];
  const stripped = text.replace(/```(?:json)?/gi, '');
  for (let start = stripped.search(/[[{]/); start !== -1 && candidates.length < 20; ) {
    // Try every closing bracket from the end, so nested objects parse whole.
    for (let end = stripped.length; end > start; end--) {
      const ch = stripped[end - 1];
      if (ch !== '}' && ch !== ']') continue;
      try {
        candidates.push(JSON.parse(stripped.slice(start, end)));
        break;
      } catch {
        // keep shrinking
      }
    }
    const next = stripped.slice(start + 1).search(/[[{]/);
    start = next === -1 ? -1 : start + 1 + next;
  }

  const visit = (value: unknown): ModelToolCall | null => {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = visit(item);
        if (found) return found;
      }
      return null;
    }
    if (typeof value !== 'object' || value === null) return null;
    const record = value as Record<string, unknown>;
    const fn = (record.function ?? record) as Record<string, unknown>;
    const name = typeof fn.name === 'string' ? fn.name : typeof record.tool === 'string' ? record.tool : null;
    if (!name || !names.has(name)) return null;
    let input = fn.parameters ?? fn.arguments ?? fn.input ?? record.input ?? {};
    if (typeof input === 'string') {
      try {
        input = JSON.parse(input);
      } catch {
        return null;
      }
    }
    return { name, input };
  };

  for (const candidate of candidates) {
    const found = visit(candidate);
    if (found) return [found];
  }
  return [];
}

function errorFor(status: number, message: string): LlmError {
  if (status === 401 || status === 403) return new LlmError(`The model provider refused the credentials: ${message}`, 'AUTH');
  if (status === 429) return new LlmError(`The model provider is rate limiting requests: ${message}`, 'RATE_LIMITED');
  if (status === 408 || status === 504) return new LlmError(`The model call timed out: ${message}`, 'TIMEOUT');
  if (status === 400 || status === 404 || status === 422) return new LlmError(`The model rejected the request: ${message}`, 'BAD_REQUEST');
  return new LlmError(`The model provider returned an error: ${message}`, 'UPSTREAM');
}

export function createOpenAiCompatibleProvider(options: OpenAiCompatibleOptions): LlmProvider {
  const doFetch = options.fetch ?? fetch;
  const endpoint = `${options.baseURL.replace(/\/+$/, '')}/chat/completions`;
  const isOpenRouter = /(^|\.)openrouter\.ai$/.test(new URL(options.baseURL).hostname);
  // Downgraded to 'auto' for the life of the provider once a server rejects 'required' (F-80).
  let toolChoice: 'required' | 'auto' = 'required';

  async function complete(modelSetting: string, request: ModelRequest, withTools: boolean): Promise<ModelResponse> {
    const models = modelSetting.split(',').map((id) => id.trim()).filter(Boolean);
    const body: Record<string, unknown> = {
      model: models[0],
      messages: toMessages(request),
      max_tokens: Math.max(request.maxTokens, MIN_MAX_TOKENS),
    };
    if (withTools && request.tools?.length) {
      body.tools = request.tools.map((tool) => ({
        type: 'function',
        function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
      }));
      // Every decision must be exactly one tool call.
      body.tool_choice = toolChoice;
      body.parallel_tool_calls = false;
    }
    if (options.reasoningEffort) {
      if (isOpenRouter) body.reasoning = { effort: options.reasoningEffort, exclude: true };
      else body.reasoning_effort = options.reasoningEffort;
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${options.apiKey}` };
    if (isOpenRouter) {
      headers['HTTP-Referer'] = 'http://localhost:3000';
      headers['X-Title'] = 'Ally';
    }

    const startedAt = Date.now();
    let lastError: LlmError | null = null;
    for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(8000, 1000 * 2 ** (attempt - 1))));
      // Each retry leads with the next model in the list.
      const order = [...models.slice(attempt % models.length), ...models.slice(0, attempt % models.length)];
      body.model = order[0];
      if (isOpenRouter && order.length > 1) body.models = order;
      let response: Response;
      try {
        response = await doFetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(options.timeoutMs) });
      } catch (error) {
        const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
        lastError = new LlmError(timedOut ? `The model call timed out after ${options.timeoutMs} ms.` : 'The model provider could not be reached.', timedOut ? 'TIMEOUT' : 'UPSTREAM', error);
        continue;
      }

      const payload = (await response.json().catch(() => ({}))) as ChatCompletion;
      if (!response.ok || payload.error) {
        const status = response.ok ? Number(payload.error?.code) || 502 : response.status;
        const message = payload.error?.message ?? payload.detail ?? response.statusText;
        // Some servers only accept tool_choice 'auto'. Ask again with it; text recovery still finds the call.
        if (status === 400 && body.tool_choice === 'required' && /tool_choice/i.test(message)) {
          toolChoice = 'auto';
          body.tool_choice = 'auto';
          attempt--;
          continue;
        }
        const error = errorFor(status, message);
        // A daily cap will not lift in a few seconds; only per-minute limits and server errors are worth retrying.
        const retryable = (status === 429 && !/per.day|daily/i.test(error.message)) || status >= 500;
        if (!retryable) throw error;
        lastError = error;
        continue;
      }

      const choice = payload.choices?.[0];
      const usage = emptyUsage();
      usage.inputTokens = payload.usage?.prompt_tokens ?? 0;
      usage.outputTokens = payload.usage?.completion_tokens ?? 0;
      usage.cacheReadInputTokens = 0;
      const text = (choice?.message?.content ?? '').trim();
      let toolCalls = parseToolCalls(payload);
      if (withTools && toolCalls.length === 0 && request.tools?.length) {
        toolCalls = toolCallsFromText(text, request.tools.map((tool) => tool.name));
      }
      // Report the configured id (with its :free suffix) when the provider echoes the bare one.
      const served = payload.model ?? String(body.model);
      const configured = models.find((id) => id === served || id.replace(/:free$/, '') === served.replace(/:free$/, ''));
      return {
        model: configured ?? served,
        text,
        toolCalls,
        stopReason: choice?.finish_reason ?? 'unknown',
        usage,
        latencyMs: Date.now() - startedAt,
      };
    }
    throw lastError ?? new LlmError('The model call failed.', 'UPSTREAM');
  }

  return {
    decide: (request) => complete(options.decideModel, request, true),
    narrate: (request) => complete(options.narrateModel, request, false),
  };
}
