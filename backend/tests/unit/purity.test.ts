/**
 * PURITY SUITE — docs/10-TEST-CASES.md section 1. BLOCKING IN CI.
 * If any of these fail, the demo is a lie: the agent must receive only an
 * accessibility tree and emit only keystrokes.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runGoal } from '../../src/agent/loop.js';
import * as driverModule from '../../src/driver/index.js';
import type { ModelRequest } from '../../src/llm/provider.js';
import { loadRecording, press, ReplayDriver, ScriptedProvider } from '../helpers/fakes.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(here, '../../src');

const COORDINATE_KEYS = new Set(['x', 'y', 'top', 'left', 'width', 'height', 'boundingBox']);

async function fullFixtureRun(): Promise<ScriptedProvider> {
  const recording = loadRecording('broken-shop/home-tab-cart.json');
  const provider = new ScriptedProvider([
    ...(['Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Enter', 'Tab'] as const).map(press),
    { name: 'read_focus', input: {} },
    { name: 'declare_blocked', input: { category: 'UNLABELLED_CONTROL', reason: 'No add-to-cart control.', axNodeId: '' } },
  ]);
  await runGoal({ goal: 'complete checkout', stepBudget: 20, driver: new ReplayDriver(recording.snapshots), llm: provider });
  return provider;
}

function collectKeys(value: unknown, keys: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      collectKeys(child, keys);
    }
  }
}

describe('purity suite', () => {
  it('P-1 the driver exports exactly axSnapshot, pressKey, typeText, focusInfo, currentUrl', () => {
    expect(Object.keys(driverModule).sort()).toEqual(['axSnapshot', 'currentUrl', 'focusInfo', 'pressKey', 'typeText']);
  });

  it('P-2 no prompt sent to any model contains an image content block', async () => {
    const provider = await fullFixtureRun();
    expect(provider.requests.filter((r) => r.kind === 'decide').length).toBeGreaterThanOrEqual(9);
    expect(provider.requests.filter((r) => r.kind === 'narrate').length).toBeGreaterThanOrEqual(9);

    for (const { request } of provider.requests) {
      const blocks = [...request.system, ...request.messages.flatMap((message) => message.content)];
      for (const block of blocks) expect(block.type).toBe('text');
      const serialised = JSON.stringify(request);
      expect(serialised).not.toMatch(/"type":"image"|data:image\/|iVBORw0KGgo|\/9j\/4AAQ|"media_type"/);
    }
  });

  it('P-3 no prompt contains a coordinate-shaped field', async () => {
    const provider = await fullFixtureRun();
    const keys = new Set<string>();
    collectKeys(provider.requests.map((r): ModelRequest => r.request), keys);
    expect([...keys].filter((key) => COORDINATE_KEYS.has(key))).toEqual([]);
    expect(JSON.stringify(provider.requests)).not.toMatch(/boundingBox|getBoundingClientRect|clientX|pageX/);
  });

  it('P-4 agent/ never reaches Playwright, preview/, sourcemap/ or a model SDK, even transitively', () => {
    const forbidden = [/^playwright(-core)?(\/|$)/, /^@playwright\//, /^@anthropic-ai\/sdk/, /\/preview(\/|\.|$)/, /\/sourcemap(\/|\.|$)/, /\/driver\/(index|session|internal|cdp|stabilize)(\.js)?$/];

    const agentDir = path.join(srcRoot, 'agent');
    const entryFiles = readdirSync(agentDir)
      .filter((file) => file.endsWith('.ts'))
      .map((file) => path.join(agentDir, file));
    expect(entryFiles.length).toBeGreaterThan(0);

    const visited = new Set<string>();
    const violations: string[] = [];
    const queue = [...entryFiles];
    while (queue.length) {
      const file = queue.pop();
      if (file === undefined || visited.has(file)) continue;
      visited.add(file);
      const source = readFileSync(file, 'utf8');
      // Runtime imports only: `import type` and `export type` are erased at compile time.
      const specifiers = [...source.matchAll(/^\s*(?:import|export)\s+(?!type\s)[^'"]*?from\s+['"]([^'"]+)['"]/gm)]
        .map((match) => match[1])
        .filter((specifier): specifier is string => specifier !== undefined);
      for (const specifier of specifiers) {
        const relative = path.relative(srcRoot, file);
        if (forbidden.some((pattern) => pattern.test(specifier))) violations.push(`${relative} imports ${specifier}`);
        if (specifier.startsWith('.')) {
          const target = path.resolve(path.dirname(file), specifier.replace(/\.js$/, '.ts'));
          if (statSync(target, { throwIfNoEntry: false })?.isFile()) queue.push(target);
        }
      }
    }
    expect(violations).toEqual([]);
    // The walk really did leave agent/ and follow the driver and llm modules.
    expect([...visited].some((file) => file.includes(`${path.sep}driver${path.sep}`))).toBe(true);
  });

  it('P-5 pressKey rejects any key outside the allow-list before touching a session', async () => {
    const noSession = { id: 'never-opened' };
    await expect(driverModule.pressKey(noSession, 'F12')).rejects.toThrow(/allow-list/);
    await expect(driverModule.pressKey(noSession, 'Control+L')).rejects.toThrow(/allow-list/);
    // A valid key gets past validation and only then fails on the missing session.
    await expect(driverModule.pressKey(noSession, 'Tab')).rejects.toThrow(/closed or unknown/);
  });

  it('P-5 typeText rejects input over 200 characters', async () => {
    const noSession = { id: 'never-opened' };
    await expect(driverModule.typeText(noSession, 'a'.repeat(201))).rejects.toThrow(/at most 200/);
    await expect(driverModule.typeText(noSession, 'a'.repeat(200))).rejects.toThrow(/closed or unknown/);
  });
});
