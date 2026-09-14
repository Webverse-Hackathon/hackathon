/**
 * The demo API end to end (DECISIONS.md #13): real Fastify, real Chromium, the
 * real broken-shop on 3100 and fixed-shop on 3101, with the model replaced by a
 * script. Checks the plumbing around the agent, not the model's judgement:
 * events, frames, axe correlation, the fix gates, and the verify re-run.
 *
 * Needs both fixture sites running:
 *   pnpm --filter @ally/fixture-broken-shop dev
 *   pnpm --filter @ally/fixture-fixed-shop dev
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RunReport, StreamEvent } from '@ally/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/api/server.js';
import { loadConfig } from '../../src/config/index.js';
import { syncVerifySite } from '../../src/fix/workspace.js';
import { emptyUsage, type LlmProvider, type ModelRequest, type ModelResponse } from '../../src/llm/provider.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '../../..');
const BROKEN = 'http://localhost:3100';
const FIXED = 'http://localhost:3101';

function respond(toolCalls: ModelResponse['toolCalls'], text = ''): ModelResponse {
  return { model: 'scripted', text, toolCalls, stopReason: 'tool_use', usage: emptyUsage(), latencyMs: 1 };
}

function allText(request: ModelRequest): string {
  return [...request.system, ...request.messages.flatMap((message) => message.content)].map((block) => block.text).join('\n');
}

/**
 * Tabs five times, then declares UNLABELLED_CONTROL naming the plus icon (the
 * second "image." before the first product's name) read from the first transcript.
 * Answers a propose_patch request with the fix a careful engineer would write.
 */
class DemoScript implements LlmProvider {
  private decisions = 0;
  private plusIconId = '';

  async narrate(): Promise<ModelResponse> {
    return respond([], 'I hear images but nothing that adds an item.');
  }

  async decide(request: ModelRequest): Promise<ModelResponse> {
    const text = allText(request);
    if (request.tools?.some((tool) => tool.name === 'propose_patch')) {
      const range = text.match(/Replace lines (\d+) to (\d+) inclusive/);
      expect(range).not.toBeNull();
      const replacement = [
        '        <button type="button" className="add" aria-label={`Add ${product.name} to cart`} onClick={() => addToCart(product.id)}>',
        '          <PlusIcon />',
        '        </button>',
      ].join('\n');
      return respond([{ name: 'propose_patch', input: { replacement, rationale: 'A named native button.' } }]);
    }

    this.decisions++;
    if (!this.plusIconId) {
      const match = text.match(/\[(\d+)\] image\.\s*\n\s*\[(\d+)\] image\.\s*\n\s*\[\d+\] Blue linen shirt/);
      this.plusIconId = match?.[2] ?? '';
    }
    if (this.decisions <= 5) return respond([{ name: 'press_key', input: { key: 'Tab', reasoning: 'explore', confidence: 0.8 } }]);
    return respond([
      {
        name: 'declare_blocked',
        input: {
          category: 'UNLABELLED_CONTROL',
          reason: 'Nothing adds an item to the cart.',
          axNodeId: this.plusIconId,
          reasoning: 'Only unnamed images sit beside each product.',
          confidence: 0.9,
        },
      },
    ]);
  }
}

async function reachable(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(30_000) })).ok;
  } catch {
    return false;
  }
}

async function waitFor<T>(read: () => T | undefined, timeoutMs: number): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = read();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('Timed out waiting.');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

const config = loadConfig({ PLAYWRIGHT_HEADLESS: 'true', ALLY_MAX_CONCURRENT_RUNS: '2' });
const { app, store } = buildApp({ config, createLlm: () => new DemoScript() });
let baseUrl = '';

beforeAll(async () => {
  for (const url of [BROKEN, FIXED]) {
    if (!(await reachable(url))) throw new Error(`${url} is not running. See the header of this file.`);
  }
  baseUrl = await app.listen({ port: 0, host: 'localhost' });
}, 120_000);

afterAll(async () => {
  await app.close();
  // The fix flow writes into fixed-shop. Put it back.
  syncVerifySite(path.join(root, 'fixtures/broken-shop'), path.join(root, 'fixtures/fixed-shop'), {});
});

describe('demo API, real browser, scripted model', () => {
  let runId = '';

  it('refuses a private address that is not allow-listed, and a malformed body', async () => {
    const privateUrl = await app.inject({ method: 'POST', url: '/api/runs', payload: { url: 'http://169.254.169.254/latest', goal: 'read metadata' } });
    expect(privateUrl.statusCode).toBe(400);
    expect(privateUrl.json().error.code).toBe('INVALID_URL');
    const bad = await app.inject({ method: 'POST', url: '/api/runs', payload: { url: 'ftp://x', goal: 'x' } });
    expect(bad.json().error.code).toBe('VALIDATION_FAILED');
  });

  it('runs to a blocker, correlates axe honestly, and streams every event', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/runs', payload: { url: BROKEN, goal: 'complete checkout', stepBudget: 20 } });
    expect(created.statusCode).toBe(201);
    runId = created.json().id;
    expect(created.json().mode).toBe('REPO_CONNECTED');

    const record = await waitFor(() => {
      const current = store.get(runId);
      return current?.finishedAt ? current : undefined;
    }, 150_000);

    const report = (await app.inject({ method: 'GET', url: `/api/runs/${runId}` })).json() as RunReport;
    expect(report.status).toBe('BLOCKED');
    expect(report.blocker?.category).toBe('UNLABELLED_CONTROL');
    expect(report.blocker?.htmlSnippet).toMatch(/<svg/);
    expect(record.fixTarget?.className).toBe('add');
    expect(report.axeViolationCount).toBeGreaterThan(5);
    expect(report.blockerCaughtByAxe).toBe(false);
    expect(report.verdict).toMatch(/^axe-core reported \d+ violations on this page\. Zero of them was the reason the agent could not complete checkout\.$/);
    expect(report.fixable).toBe(true);

    const names = record.events.map((logged) => logged.event.event);
    for (const name of ['run.started', 'step.perception', 'step.narration', 'step.decision', 'step.action', 'run.blocked', 'run.correlated', 'run.finished']) {
      expect(names).toContain(name);
    }
    expect(names.indexOf('run.correlated')).toBeLessThan(names.indexOf('run.finished'));

    const frame = await app.inject({ method: 'GET', url: `/api/runs/${runId}/frame` });
    expect(frame.statusCode).toBe(200);
    expect(frame.headers['content-type']).toBe('image/jpeg');
    const seq = Number(frame.headers['x-frame-seq']);
    expect((await app.inject({ method: 'GET', url: `/api/runs/${runId}/frame?after=${seq}` })).statusCode).toBe(204);
  }, 180_000);

  it('replays the stream after Last-Event-ID over real SSE', async () => {
    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/api/runs/${runId}/stream`, { headers: { 'Last-Event-ID': '3' }, signal: controller.signal });
    expect(response.headers.get('content-type')).toMatch(/text\/event-stream/);
    const reader = response.body!.getReader();
    let text = '';
    while (!text.includes('event: run.finished')) {
      const { value, done } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value);
    }
    controller.abort();
    const ids = [...text.matchAll(/^id: (\d+)$/gm)].map((match) => Number(match[1]));
    expect(ids[0]).toBe(4);
  }, 30_000);

  it('fixes the blocker: locates the JSX, passes the five gates, and re-runs against the patched site', async () => {
    const started = await app.inject({ method: 'POST', url: `/api/runs/${runId}/fix` });
    expect(started.statusCode).toBe(202);
    expect((await app.inject({ method: 'POST', url: `/api/runs/${runId}/fix` })).statusCode).toBe(409);

    const record = store.get(runId)!;
    const outcome = await waitFor(() => {
      const events = record.events.map((logged) => logged.event);
      return events.find((event) => event.event === 'fix.verified' || event.event === 'fix.failed');
    }, 240_000);

    const events = record.events.map((logged) => logged.event);
    const failure = events.find((event): event is Extract<StreamEvent, { event: 'fix.failed' }> => event.event === 'fix.failed');
    expect(failure?.data.reason).toBeUndefined();
    expect(outcome.event).toBe('fix.verified');

    const located = events.find((event): event is Extract<StreamEvent, { event: 'fix.located' }> => event.event === 'fix.located');
    expect(located?.data).toMatchObject({ filePath: 'components/ProductCard.tsx', lineStart: 43, lineEnd: 45, locateMethod: 'ast-search', locateConfidence: 1 });
    const validated = events.find((event): event is Extract<StreamEvent, { event: 'fix.validated' }> => event.event === 'fix.validated');
    expect(validated?.data.gates).toEqual({ appliesCleanly: true, parses: true, typechecks: true, jsxA11y: true, sizeOk: true });
    expect(events.some((event) => event.event === 'fix.stage' && event.data.stage === 'pr' && event.data.status === 'skipped')).toBe(true);

    expect(record.patch?.diff).toContain('+        <button type="button" className="add"');
    const patched = readFileSync(path.join(root, 'fixtures/fixed-shop/components/ProductCard.tsx'), 'utf8');
    expect(patched).toContain('aria-label={`Add ${product.name} to cart`}');

    const verify = store.get(record.verifyRunId!)!;
    expect(verify.url).toBe(`${FIXED}/`);
    expect(verify.source).toBe('VERIFY');
    expect(verify.finishedAt).not.toBeNull();
  }, 300_000);
});
