/**
 * The agent loop, driven by recorded snapshots and a scripted model. No browser,
 * no network, no cost. Covers the budget (I-07), F-04, F-10, F-11, F-13 and
 * F-20 paths through runGoal.
 */

import type { StreamEvent } from '@ally/shared';
import { describe, expect, it } from 'vitest';
import { runGoal } from '../../src/agent/loop.js';
import { roleOf, nameOf } from '../../src/driver/tree.js';
import { LlmError, type LlmProvider } from '../../src/llm/provider.js';
import { page } from '../helpers/ax.js';
import { loadRecording, press, ReplayDriver, ScriptedProvider } from '../helpers/fakes.js';

const recording = loadRecording('broken-shop/home-tab-cart.json');
const firstUnnamedImage = recording.snapshots[0]?.nodes.find((node) => roleOf(node) === 'image' && nameOf(node) === '');

function run(script: ConstructorParameters<typeof ScriptedProvider>[0], stepBudget = 20, llm?: LlmProvider) {
  const events: StreamEvent[] = [];
  const provider = llm ?? new ScriptedProvider(script);
  const driver = new ReplayDriver(recording.snapshots);
  const result = runGoal({ goal: 'complete checkout', stepBudget, driver, llm: provider, onEvent: (event) => events.push(event) });
  return { result, events, provider, driver };
}

describe('runGoal on the recorded broken-shop session', () => {
  it('walks the header, opens the cart, and records the blocker it names', async () => {
    const { result, events, driver } = run([
      ...(['Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Enter', 'Tab'] as const).map(press),
      {
        name: 'declare_blocked',
        input: { category: 'UNLABELLED_CONTROL', reason: 'No control adds a product to the cart.', axNodeId: firstUnnamedImage?.nodeId ?? '' },
      },
    ]);
    const outcome = await result;

    expect(driver.pressed).toEqual(['Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Enter', 'Tab']);
    expect(outcome.stepsUsed).toBe(8);
    expect(outcome.outcome.status).toBe('BLOCKED');
    if (outcome.outcome.status !== 'BLOCKED') return;
    expect(outcome.outcome.blocker).toMatchObject({
      atStep: 8,
      category: 'UNLABELLED_CONTROL',
      role: 'image',
      accessibleName: null,
      wcagCriteria: ['4.1.2'],
    });
    expect(outcome.outcome.blocker.backendNodeId).toBe(firstUnnamedImage?.backendDOMNodeId);

    expect(events.filter((event) => event.event === 'step.action').map((event) => event.data)).toContainEqual(
      expect.objectContaining({ index: 6, result: 'focus did not move' }),
    );
    expect(events.at(-1)).toMatchObject({ event: 'run.blocked', data: { atStep: 8, category: 'UNLABELLED_CONTROL' } });
  });

  it('emits perception, narration, decision and action for each step, in that order', async () => {
    const { result, events } = run([press('Tab')], 1);
    await result;
    expect(events.map((event) => event.event)).toEqual(['step.perception', 'step.narration', 'step.decision', 'step.action']);
  });

  it('narration "decision" makes one model call per step and speaks the guarded reasoning, in the same event order', async () => {
    const provider = new ScriptedProvider([press('Tab'), press('Tab')]);
    const events: StreamEvent[] = [];
    await runGoal({
      goal: 'complete checkout',
      stepBudget: 2,
      driver: new ReplayDriver(recording.snapshots),
      llm: provider,
      narration: 'decision',
      onEvent: (event) => events.push(event),
    });
    expect(provider.requests.filter((request) => request.kind === 'narrate')).toHaveLength(0);
    expect(provider.requests.filter((request) => request.kind === 'decide')).toHaveLength(2);
    expect(events.slice(0, 4).map((event) => event.event)).toEqual(['step.perception', 'step.narration', 'step.decision', 'step.action']);
    // ScriptedProvider's reasoning is "scripted": no forbidden words, so it is spoken as is.
    expect(events.find((event) => event.event === 'step.narration')).toMatchObject({ data: { index: 1, text: 'scripted' } });
  });

  it('I-07 the step budget is honoured: a 3-step budget yields ABANDONED', async () => {
    const { result } = run([], 3);
    const outcome = await result;
    expect(outcome.outcome.status).toBe('ABANDONED');
    expect(outcome.stepsUsed).toBe(3);
  });

  it('F-10 a declaration before step five is refused and the run continues', async () => {
    const { result, events } = run([
      { name: 'declare_blocked', input: { category: 'UNLABELLED_CONTROL', reason: 'too early', axNodeId: '' } },
    ], 3);
    const outcome = await result;
    expect(outcome.outcome.status).toBe('ABANDONED');
    expect(events.some((event) => event.event === 'step.warning' && event.data.text.includes('refused'))).toBe(true);
  });

  it('F-13 an unsupported success claim is downgraded to BLOCKED / UNKNOWN', async () => {
    const { result } = run([{ name: 'declare_success', input: { evidence: 'I completed checkout' } }]);
    const outcome = await result;
    expect(outcome.outcome.status).toBe('BLOCKED');
    if (outcome.outcome.status === 'BLOCKED') {
      expect(outcome.outcome.blocker.category).toBe('UNKNOWN');
      expect(outcome.outcome.blocker.summary).toContain('"I completed checkout"');
    }
  });

  it('three unusable decisions in a row end the run as ERRORED, not as a finding', async () => {
    const { result } = run([null, null, null, null, null, null]);
    const outcome = await result;
    expect(outcome.outcome).toMatchObject({ status: 'ERRORED', code: 'DECISION_INVALID' });
  });

  it('F-20 a provider failure ends the run as ERRORED with the provider code', async () => {
    const failing: LlmProvider = {
      narrate: async () => {
        throw new LlmError('slow', 'TIMEOUT');
      },
      decide: async () => {
        throw new LlmError('rate limited', 'RATE_LIMITED');
      },
    };
    const { result } = run([], 20, failing);
    expect((await result).outcome).toMatchObject({ status: 'ERRORED', code: 'LLM_RATE_LIMITED' });
  });
});

describe('runGoal guards', () => {
  it('F-17 if focus moved between perceiving and typing, nothing is typed and the step is perceived again', async () => {
    const form = page([
      { role: 'textbox', name: 'Email', id: 10, props: { focusable: true, focused: true } },
      ...Array.from({ length: 5 }, (_, i) => ({ role: 'StaticText', name: `Line ${i}` })),
    ]);
    const driver = new ReplayDriver([form]);
    let focusChecks = 0;
    // The first focus check after the decision reports focus somewhere else.
    driver.focusInfo = async () =>
      focusChecks++ === 0
        ? { axNodeId: '99', backendNodeId: 99, role: 'button', name: 'Subscribe' }
        : { axNodeId: '10', backendNodeId: 10, role: 'textbox', name: 'Email' };
    const events: StreamEvent[] = [];
    const outcome = await runGoal({
      goal: 'subscribe',
      stepBudget: 1,
      driver,
      llm: new ScriptedProvider([
        { name: 'type_text', input: { text: 'sam@example.com' } },
        { name: 'type_text', input: { text: 'sam@example.com' } },
      ]),
      onEvent: (event) => events.push(event),
    });
    expect(events.some((event) => event.event === 'step.warning' && event.data.text.includes('Focus moved before typing'))).toBe(true);
    expect(driver.typed).toEqual(['sam@example.com']);
    expect(outcome.stepsUsed).toBe(1);
  });

  it('F-04 a page exposing almost nothing is CONTENT_NOT_REACHABLE at step 1, with no decision call', async () => {
    const provider = new ScriptedProvider([]);
    const outcome = await runGoal({
      goal: 'start the game',
      stepBudget: 20,
      driver: new ReplayDriver([page([{ role: 'Canvas' }])]),
      llm: provider,
    });
    expect(outcome.outcome.status).toBe('BLOCKED');
    if (outcome.outcome.status === 'BLOCKED') expect(outcome.outcome.blocker.category).toBe('CONTENT_NOT_REACHABLE');
    expect(provider.requests.filter((r) => r.kind === 'decide')).toHaveLength(0);
  });

  it('F-11 a page that never changes is stopped by the loop detector before a third decision', async () => {
    const provider = new ScriptedProvider([]);
    const still = page(Array.from({ length: 6 }, (_, i) => ({ role: 'StaticText', name: `Paragraph ${i}` })));
    const outcome = await runGoal({ goal: 'find the pricing article', stepBudget: 20, driver: new ReplayDriver([still]), llm: provider });
    expect(outcome.stepsUsed).toBe(3);
    expect(outcome.outcome.status).toBe('BLOCKED');
    expect(provider.requests.filter((r) => r.kind === 'decide')).toHaveLength(2);
  });
});
