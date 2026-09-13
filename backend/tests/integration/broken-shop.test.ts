/**
 * Real Chromium against the real broken-shop fixture, with the model replaced by
 * a script so the run is deterministic and free. docs/10-TEST-CASES.md §4.
 *
 * Uses FIXTURE_URL if something is already serving there; otherwise builds (if
 * needed) and starts the fixture on port 3100 for the duration of the suite.
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StreamEvent } from '@ally/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runGoal } from '../../src/agent/loop.js';
import { readPage } from '../../src/driver/serialize.js';
import { bindAgentDriver, closeSession, openSession } from '../../src/driver/session.js';
import { press, ScriptedProvider } from '../helpers/fakes.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(here, '../../../fixtures/broken-shop');
const fixtureUrl = process.env.FIXTURE_URL ?? 'http://localhost:3100';

let server: ChildProcess | undefined;

async function reachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  if (await reachable(fixtureUrl)) return;
  if (!existsSync(path.join(fixtureDir, '.next', 'BUILD_ID'))) {
    const build = spawnSync('pnpm', ['exec', 'next', 'build'], { cwd: fixtureDir, stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
    if (build.status !== 0) throw new Error('Building fixtures/broken-shop failed.');
  }
  server = spawn('pnpm', ['exec', 'next', 'start', '-p', new URL(fixtureUrl).port || '3100'], {
    cwd: fixtureDir,
    stdio: 'ignore',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  });
  const deadline = Date.now() + 60_000;
  while (!(await reachable(fixtureUrl))) {
    if (Date.now() > deadline) throw new Error(`broken-shop did not start at ${fixtureUrl}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}, 240_000);

afterAll(() => {
  server?.kill();
});

describe('broken-shop, real browser', () => {
  it('I-01 (scripted model) the loop drives Chromium to the planted blockers', async () => {
    const session = await openSession(fixtureUrl);
    const events: StreamEvent[] = [];
    const provider = new ScriptedProvider([
      ...(['Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Enter', 'Tab'] as const).map(press),
      { name: 'declare_blocked', input: { category: 'UNLABELLED_CONTROL', reason: 'Nothing adds a product to the cart.', axNodeId: '' } },
    ]);
    try {
      const result = await runGoal({
        goal: 'complete checkout',
        stepBudget: 20,
        driver: bindAgentDriver(session),
        llm: provider,
        onEvent: (event) => events.push(event),
      });

      expect(result.outcome.status).toBe('BLOCKED');
      expect(result.stepsUsed).toBe(8);

      const actions = events.flatMap((event) => (event.event === 'step.action' ? [event.data.result] : []));
      expect(actions.slice(0, 5)).toEqual([
        'focus moved to link, Linen & Salt',
        'focus moved to link, New in',
        'focus moved to link, Summer sale',
        'focus moved to link, Journal',
        'focus moved to button, Cart (0)',
      ]);
      // Planted blocker 2: Enter opens the cart, focus stays put, and Tab leaves for the newsletter.
      expect(actions[5]).toBe('focus did not move');
      expect(actions[6]).toBe('focus moved to edit');

      const perceptions = events.flatMap((event) => (event.event === 'step.perception' ? [event.data.lines.map((l) => l.spoken)] : []));
      expect(perceptions[0]).toContain('list, six items.');
      expect(perceptions[6]).toEqual(['nothing new was announced.']);

      // The blocker falls back to the focused node when the agent names none.
      if (result.outcome.status === 'BLOCKED') {
        expect(result.outcome.blocker.role).toBe('textbox');
        expect(result.outcome.blocker.backendNodeId).toEqual(expect.any(Number));
      }
    } finally {
      await closeSession(session);
    }
  }, 120_000);

  it('the checkout page is accessible on its own, and says the cart is empty', async () => {
    const session = await openSession(`${fixtureUrl}/checkout`);
    try {
      const lines = readPage(await bindAgentDriver(session).axSnapshot()).map((line) => line.spoken);
      expect(lines).toContain('heading level one, Checkout.');
      expect(lines).toContain('Your cart is empty. Add something before checking out.');
      expect(lines).toContain('link, Continue shopping.');
    } finally {
      await closeSession(session);
    }
  }, 60_000);

  it('P-5 against a live session: a disallowed key never reaches the page', async () => {
    const session = await openSession(fixtureUrl);
    try {
      const driver = bindAgentDriver(session);
      const { pressKey } = await import('../../src/driver/index.js');
      await expect(pressKey(session, 'F5')).rejects.toThrow(/allow-list/);
      expect(driver.currentUrl()).toBe(`${fixtureUrl}/`);
    } finally {
      await closeSession(session);
    }
  }, 60_000);
});
