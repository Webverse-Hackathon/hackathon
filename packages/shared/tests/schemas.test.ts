import { describe, expect, it } from 'vitest';
import {
  AgentToolSchema,
  ALLOWED_KEYS,
  ApiErrorSchema,
  RunRequestSchema,
  StreamEventSchema,
  TYPE_TEXT_MAX_LENGTH,
} from '../src/index.js';

describe('AgentToolSchema — the agent may emit keystrokes and nothing else', () => {
  it('accepts every allow-listed key', () => {
    for (const key of ALLOWED_KEYS) {
      expect(AgentToolSchema.safeParse({ tool: 'press_key', input: { key } }).success).toBe(true);
    }
  });

  it('rejects a key outside the allow-list (P-5)', () => {
    expect(AgentToolSchema.safeParse({ tool: 'press_key', input: { key: 'F12' } }).success).toBe(false);
  });

  it('rejects type_text over the length limit (P-5)', () => {
    const text = 'a'.repeat(TYPE_TEXT_MAX_LENGTH + 1);
    expect(AgentToolSchema.safeParse({ tool: 'type_text', input: { text } }).success).toBe(false);
  });

  it('rejects tools that do not exist', () => {
    for (const tool of ['click', 'goto', 'evaluate', 'screenshot']) {
      expect(AgentToolSchema.safeParse({ tool, input: {} }).success).toBe(false);
    }
  });

  it('rejects coordinate-shaped fields smuggled into a tool call (P-3)', () => {
    const smuggled = { tool: 'press_key', input: { key: 'Enter', x: 120, y: 48 } };
    expect(AgentToolSchema.safeParse(smuggled).success).toBe(false);
    const topLevel = { tool: 'read_focus', input: {}, boundingBox: { x: 0, y: 0 } };
    expect(AgentToolSchema.safeParse(topLevel).success).toBe(false);
  });

  it('accepts declare_blocked with and without a node id', () => {
    const base = { tool: 'declare_blocked', input: { category: 'UNLABELLED_CONTROL', reason: 'no name' } };
    expect(AgentToolSchema.safeParse(base).success).toBe(true);
    expect(AgentToolSchema.safeParse({ ...base, input: { ...base.input, axNodeId: '42' } }).success).toBe(true);
  });
});

describe('RunRequestSchema — docs/05 POST /api/runs', () => {
  it('accepts the documented request', () => {
    const result = RunRequestSchema.safeParse({
      url: 'https://shop.example.com',
      goal: 'complete checkout',
      stepBudget: 20,
      source: 'MANUAL',
      repo: { owner: 'Webverse-Hackathon', name: 'ally-demo-shop', commitSha: 'a1b2c3d', branch: 'main' },
    });
    expect(result.success).toBe(true);
  });

  it.each(['javascript:alert(1)', 'file:///etc/passwd', 'ftp://example.com', 'not a url'])(
    'rejects %s without throwing',
    (url) => {
      expect(RunRequestSchema.safeParse({ url, goal: 'complete checkout' }).success).toBe(false);
    },
  );

  it('enforces the goal length and step budget bounds', () => {
    const ok = { url: 'https://example.com', goal: 'complete checkout' };
    expect(RunRequestSchema.safeParse({ ...ok, goal: 'go' }).success).toBe(false);
    expect(RunRequestSchema.safeParse({ ...ok, goal: 'x'.repeat(201) }).success).toBe(false);
    expect(RunRequestSchema.safeParse({ ...ok, stepBudget: 0 }).success).toBe(false);
    expect(RunRequestSchema.safeParse({ ...ok, stepBudget: 51 }).success).toBe(false);
  });

  it('does not let a client request a VERIFY run', () => {
    const result = RunRequestSchema.safeParse({ url: 'https://example.com', goal: 'checkout', source: 'VERIFY' });
    expect(result.success).toBe(false);
  });
});

describe('StreamEventSchema — docs/05 SSE catalogue', () => {
  it('accepts fix.located with the same field names as the report', () => {
    const result = StreamEventSchema.safeParse({
      event: 'fix.located',
      data: {
        filePath: 'components/ProductCard.tsx',
        lineStart: 41,
        lineEnd: 47,
        locateMethod: 'data-attribute',
        locateConfidence: 1,
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown event name', () => {
    expect(StreamEventSchema.safeParse({ event: 'run.paused', data: {} }).success).toBe(false);
  });
});

describe('ApiErrorSchema', () => {
  it('accepts the documented error shape', () => {
    const result = ApiErrorSchema.safeParse({
      error: { code: 'INVALID_URL', message: 'Private network addresses are not allowed.', details: { field: 'url' } },
    });
    expect(result.success).toBe(true);
  });
});
