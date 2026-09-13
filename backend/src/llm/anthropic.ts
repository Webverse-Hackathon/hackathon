/**
 * The Anthropic adapter: the only file in the codebase that imports the SDK.
 *
 * decide → Claude Sonnet 5. Sonnet 5 rejects `temperature` (400), so the
 * "temperature 0" mitigation in docs/06 is not available; determinism rests on
 * record-and-replay and on gating by blocker category (DECISIONS.md #9, F-12).
 * Adaptive thinking is on by default for Sonnet 5; effort is kept low for pace.
 * With thinking on, forced tool_choice is not allowed, so we use `auto`, a
 * system instruction to always call exactly one tool, and strict tool schemas.
 *
 * narrate → Claude Haiku 4.5, a little sampling, a short answer.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  LlmError,
  type LlmProvider,
  type ModelRequest,
  type ModelResponse,
  type TextBlock,
} from './provider.js';

export type DecideEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AnthropicProviderOptions {
  apiKey: string;
  decideModel: string;
  narrateModel: string;
  decideEffort: DecideEffort;
  /** Per call. F-20: beyond this the audience disengages. */
  timeoutMs: number;
  /** The SDK retries 408/409/429/5xx and connection errors with backoff. F-20. */
  maxRetries: number;
}

function toSystem(blocks: TextBlock[]): Anthropic.TextBlockParam[] {
  return blocks.map((block) =>
    block.cache ? { type: 'text', text: block.text, cache_control: { type: 'ephemeral' } } : { type: 'text', text: block.text },
  );
}

function toMessages(request: ModelRequest): Anthropic.MessageParam[] {
  return request.messages.map((message) => ({
    role: message.role,
    content: message.content.map((block): Anthropic.TextBlockParam =>
      block.cache ? { type: 'text', text: block.text, cache_control: { type: 'ephemeral' } } : { type: 'text', text: block.text },
    ),
  }));
}

function toTools(request: ModelRequest): Anthropic.Tool[] | undefined {
  if (!request.tools?.length) return undefined;
  return request.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
    strict: true,
  }));
}

function toResponse(message: Anthropic.Message, startedAt: number): ModelResponse {
  if (message.stop_reason === 'refusal') {
    throw new LlmError('The model declined the request.', 'REFUSED');
  }
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
  const toolCalls = message.content
    .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
    .map((block) => ({ name: block.name, input: block.input }));
  return {
    model: message.model,
    text,
    toolCalls,
    stopReason: message.stop_reason ?? 'unknown',
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: message.usage.cache_creation_input_tokens ?? 0,
    },
    latencyMs: Date.now() - startedAt,
  };
}

function translateError(error: unknown): never {
  if (error instanceof LlmError) throw error;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    throw new LlmError('The Anthropic API key was rejected.', 'AUTH', error);
  }
  if (error instanceof Anthropic.RateLimitError) {
    throw new LlmError('The model provider is rate limiting requests.', 'RATE_LIMITED', error);
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    throw new LlmError('The model call timed out.', 'TIMEOUT', error);
  }
  if (error instanceof Anthropic.BadRequestError) {
    throw new LlmError(`The model rejected the request: ${error.message}`, 'BAD_REQUEST', error);
  }
  if (error instanceof Anthropic.APIError) {
    throw new LlmError(`The model provider returned an error: ${error.message}`, 'UPSTREAM', error);
  }
  throw new LlmError('The model call failed.', 'UPSTREAM', error);
}

export function createAnthropicProvider(options: AnthropicProviderOptions): LlmProvider {
  const client = new Anthropic({
    apiKey: options.apiKey,
    timeout: options.timeoutMs,
    maxRetries: options.maxRetries,
  });

  return {
    async decide(request) {
      const startedAt = Date.now();
      try {
        const tools = toTools(request);
        const message = await client.messages.create({
          model: options.decideModel,
          max_tokens: request.maxTokens,
          thinking: { type: 'adaptive' },
          output_config: { effort: options.decideEffort },
          system: toSystem(request.system),
          messages: toMessages(request),
          ...(tools ? { tools, tool_choice: { type: 'auto', disable_parallel_tool_use: true } } : {}),
        });
        return toResponse(message, startedAt);
      } catch (error) {
        translateError(error);
      }
    },

    async narrate(request) {
      const startedAt = Date.now();
      try {
        const message = await client.messages.create({
          model: options.narrateModel,
          max_tokens: request.maxTokens,
          temperature: 0.3,
          system: toSystem(request.system),
          messages: toMessages(request),
        });
        return toResponse(message, startedAt);
      } catch (error) {
        translateError(error);
      }
    },
  };
}
