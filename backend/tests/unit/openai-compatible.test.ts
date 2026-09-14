/**
 * The OpenAI-compatible adapter (DECISIONS.md #15) against a fake fetch: what it
 * sends, what it parses, and how it classifies failures. No network, no cost.
 */

import { describe, expect, it } from 'vitest';
import { narrationFromReasoning } from '../../src/agent/narrate.js';
import { buildDecisionRequest } from '../../src/agent/prompts.js';
import { TOOL_DEFINITIONS } from '../../src/agent/tools.js';
import { createOpenAiCompatibleProvider, toolCallsFromText } from '../../src/llm/openai-compatible.js';
import { costUsd } from '../../src/llm/cost.js';

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function fakeFetch(responses: { status: number; body: unknown }[], captured: Captured[]): typeof fetch {
  let index = 0;
  return (async (url: string | URL | Request, init?: RequestInit) => {
    captured.push({ url: String(url), headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    const next = responses[Math.min(index++, responses.length - 1)]!;
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
}

function provider(responses: { status: number; body: unknown }[], captured: Captured[], baseURL = 'https://openrouter.ai/api/v1') {
  return createOpenAiCompatibleProvider({
    apiKey: 'test-key',
    baseURL,
    decideModel: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    narrateModel: 'nvidia/nemotron-3.5-lightning:free',
    reasoningEffort: 'low',
    timeoutMs: 5000,
    maxRetries: 1,
    fetch: fakeFetch(responses, captured),
  });
}

const request = buildDecisionRequest({ goal: 'complete checkout', step: 1, budget: 20, history: [], transcript: [] });

describe('OpenAI-compatible adapter', () => {
  it('sends text-only messages, the five tools as functions, one required call, and OpenRouter reasoning', async () => {
    const captured: Captured[] = [];
    const llm = provider(
      [{ status: 200, body: { model: 'nvidia/nemotron-3-ultra-550b-a55b:free', choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ type: 'function', function: { name: 'press_key', arguments: '{"key":"Tab","reasoning":"r","confidence":0.7}' } }] } }], usage: { prompt_tokens: 900, completion_tokens: 40 } } }],
      captured,
    );
    const response = await llm.decide(request);

    const sent = captured[0]!;
    expect(sent.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(sent.headers.Authorization).toBe('Bearer test-key');
    expect(sent.body.model).toBe('nvidia/nemotron-3-ultra-550b-a55b:free');
    expect(sent.body.tool_choice).toBe('required');
    expect(sent.body.parallel_tool_calls).toBe(false);
    expect(sent.body.reasoning).toEqual({ effort: 'low', exclude: true });
    expect((sent.body.tools as { function: { name: string } }[]).map((tool) => tool.function.name)).toEqual(TOOL_DEFINITIONS.map((tool) => tool.name));
    // P-2 holds through this adapter too: every message is a plain string.
    for (const message of sent.body.messages as { content: unknown }[]) expect(typeof message.content).toBe('string');
    expect(JSON.stringify(sent.body)).not.toMatch(/image_url|"type":"image"|data:image\//);

    expect(response.toolCalls).toEqual([{ name: 'press_key', input: { key: 'Tab', reasoning: 'r', confidence: 0.7 } }]);
    expect(response.usage).toMatchObject({ inputTokens: 900, outputTokens: 40 });
  });

  it('drops a tool call with malformed arguments instead of throwing, so the loop can ask again', async () => {
    const llm = provider([{ status: 200, body: { choices: [{ message: { tool_calls: [{ function: { name: 'press_key', arguments: '{"key": Tab' } }] } }] } }], []);
    expect((await llm.decide(request)).toolCalls).toEqual([]);
  });

  it('recovers a tool call written as text, as nemotron-3-super did on the live probe, but only for a known tool', async () => {
    const written = '[[ \n  {\n    "name": "press_key",\n    "parameters": {\n      "key": "Tab",\n      "reasoning": "I will press Tab to move forward.",\n      "confidence": 0.8\n    }\n  }\n]]';
    const llm = provider([{ status: 200, body: { choices: [{ message: { content: written } }] } }], []);
    expect((await llm.decide(request)).toolCalls).toEqual([
      { name: 'press_key', input: { key: 'Tab', reasoning: 'I will press Tab to move forward.', confidence: 0.8 } },
    ]);
    expect(toolCallsFromText('```json\n{"function": {"name": "read_focus", "arguments": "{\\"reasoning\\":\\"r\\",\\"confidence\\":1}"}}\n```', ['read_focus'])).toEqual([
      { name: 'read_focus', input: { reasoning: 'r', confidence: 1 } },
    ]);
    expect(toolCallsFromText('{"name": "click", "parameters": {"x": 10, "y": 20}}', ['press_key'])).toEqual([]);
    expect(toolCallsFromText('I think I should press Tab.', ['press_key'])).toEqual([]);
  });

  it('uses reasoning_effort outside OpenRouter, and sends no tools on narrate', async () => {
    const captured: Captured[] = [];
    const llm = provider([{ status: 200, body: { choices: [{ message: { content: 'I hear a banner.' } }] } }], captured, 'https://api.groq.com/openai/v1');
    const response = await llm.narrate({ ...request, tools: undefined, maxTokens: 120 });
    expect(captured[0]!.body.reasoning_effort).toBe('low');
    expect(captured[0]!.body.tools).toBeUndefined();
    expect(captured[0]!.body.max_tokens).toBe(2000);
    expect(response.text).toBe('I hear a banner.');
  });

  it('classifies failures: auth and a daily cap are not retried, a per-minute 429 is', async () => {
    await expect(provider([{ status: 401, body: { error: { message: 'unauthorized client detected' } } }], []).decide(request)).rejects.toMatchObject({ code: 'AUTH' });

    const daily: Captured[] = [];
    await expect(provider([{ status: 429, body: { error: { message: 'Rate limit exceeded: free-models-per-day' } } }], daily).decide(request)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(daily).toHaveLength(1);

    const perMinute: Captured[] = [];
    const recovered = await provider(
      [
        { status: 429, body: { error: { message: 'Rate limit exceeded: free-models-per-min' } } },
        { status: 200, body: { choices: [{ message: { content: 'ok' } }] } },
      ],
      perMinute,
    ).narrate({ ...request, tools: undefined });
    expect(perMinute).toHaveLength(2);
    expect(recovered.text).toBe('ok');
  }, 10_000);

  it('falls back to tool_choice auto once when a server rejects required, and reads NIM problem details (F-80)', async () => {
    const captured: Captured[] = [];
    const llm = provider(
      [
        { status: 400, body: { type: 'about:blank', status: 400, title: 'Bad Request', detail: "tool_choice 'required' is not supported" } },
        { status: 200, body: { choices: [{ message: { content: null, tool_calls: [{ type: 'function', function: { name: 'press_key', arguments: '{"key":"Tab","reasoning":"r","confidence":0.7}' } }] } }] } },
      ],
      captured,
      'https://integrate.api.nvidia.com/v1',
    );
    const first = await llm.decide(request);
    expect(first.toolCalls[0]?.name).toBe('press_key');
    await llm.decide(request);
    expect(captured.map((call) => call.body.tool_choice)).toEqual(['required', 'auto', 'auto']);

    await expect(provider([{ status: 400, body: { status: 400, title: 'Bad Request', detail: 'Function id not found for account' } }], []).decide(request)).rejects.toThrow(/Function id not found/);
  });

  it('falls through a comma-separated model list when a model is overloaded', async () => {
    const captured: Captured[] = [];
    const llm = createOpenAiCompatibleProvider({
      apiKey: 'k',
      baseURL: 'https://openrouter.ai/api/v1',
      decideModel: 'nvidia/a:free, google/b:free',
      narrateModel: 'x',
      reasoningEffort: null,
      timeoutMs: 5000,
      maxRetries: 1,
      fetch: fakeFetch(
        [
          { status: 502, body: { error: { message: 'Upstream error from Nvidia: Service temporarily overloaded' } } },
          { status: 200, body: { model: 'google/b', choices: [{ message: { tool_calls: [{ function: { name: 'read_focus', arguments: '{}' } }] } }] } },
        ],
        captured,
      ),
    });
    const response = await llm.decide(request);
    expect(captured.map((call) => call.body.model)).toEqual(['nvidia/a:free', 'google/b:free']);
    expect(captured[0]!.body.models).toEqual(['nvidia/a:free', 'google/b:free']);
    expect(captured[1]!.body.models).toEqual(['google/b:free', 'nvidia/a:free']);
    expect(response.model).toBe('google/b:free');
  }, 10_000);

  it('prices free variants at a known zero', () => {
    expect(costUsd('nvidia/nemotron-3-ultra-550b-a55b:free', { inputTokens: 5000, outputTokens: 500, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 })).toBe(0);
  });
});

describe('narrationFromReasoning (F-18 in decision mode)', () => {
  const transcript = [{ axNodeId: '1', role: 'image', name: null, states: [], spoken: 'image.' }];
  it('speaks a clean reason, and replaces a visual one with the transcript', () => {
    expect(narrationFromReasoning('No control I heard adds an item, so I move on.', transcript)).toBe('No control I heard adds an item, so I move on.');
    expect(narrationFromReasoning('The button at the top right looks like the cart.', transcript)).toBe('image.');
    expect(narrationFromReasoning('', transcript)).toBe('image.');
  });
});
