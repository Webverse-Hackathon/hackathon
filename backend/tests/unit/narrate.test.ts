/** Narration guard — docs/10-TEST-CASES.md N-01 to N-05 (F-18). */

import type { TranscriptLine } from '@ally/shared';
import { describe, expect, it } from 'vitest';
import { fallbackNarration, narrateStep, narrationViolations } from '../../src/agent/narrate.js';
import { emptyUsage, LlmError, type LlmProvider, type ModelResponse } from '../../src/llm/provider.js';

const line = (spoken: string): TranscriptLine => ({ axNodeId: '1', role: 'button', name: null, states: [], spoken });
const transcript = [line('button.'), line('button.'), line('button.')];

function providerSaying(...replies: (string | Error)[]): LlmProvider & { calls: number } {
  let calls = 0;
  const reply = (): ModelResponse => {
    const next = replies[Math.min(calls, replies.length - 1)];
    calls++;
    if (next instanceof Error) throw next;
    return { model: 'test', text: next ?? '', toolCalls: [], stopReason: 'end_turn', usage: emptyUsage(), latencyMs: 1 };
  };
  return {
    get calls() {
      return calls;
    },
    narrate: async () => reply(),
    decide: async () => reply(),
  };
}

describe('narration guard', () => {
  it('N-01 "the blue button at the top right" is rejected and regenerated', async () => {
    expect(narrationViolations('the blue button at the top right', transcript)).toEqual(['blue', 'top', 'right']);
    const llm = providerSaying('the blue button at the top right', 'Three unnamed buttons.');
    const result = await narrateStep(llm, 'complete checkout', transcript);
    expect(result).toMatchObject({ text: 'Three unnamed buttons.', source: 'model' });
    expect(llm.calls).toBe(2);
  });

  it('N-02 "I see three images" is rejected', () => {
    expect(narrationViolations('I see three images', transcript)).toContain('see');
  });

  it('N-03 "the button appears disabled" is rejected', () => {
    expect(narrationViolations('the button appears disabled', transcript)).toContain('appears');
  });

  it('N-04 a sentence about what was heard is accepted', () => {
    expect(narrationViolations('three unnamed buttons; I cannot tell which adds an item', transcript)).toEqual([]);
  });

  it('N-05 a second failure falls back to the raw transcript, never a violation', async () => {
    const llm = providerSaying('I see a red button', 'It appears on the left');
    const result = await narrateStep(llm, 'complete checkout', transcript);
    expect(result.source).toBe('fallback');
    expect(result.text).toBe(fallbackNarration(transcript));
    expect(narrationViolations(result.text, transcript)).toEqual([]);
  });

  it('a word the page itself said is not a violation', () => {
    expect(narrationViolations('A blue linen shirt, with no way to add it.', [line('Blue linen shirt.')])).toEqual([]);
  });

  it('a failed model call falls back instead of failing the run (F-20)', async () => {
    const llm = providerSaying(new LlmError('timeout', 'TIMEOUT'));
    const result = await narrateStep(llm, 'complete checkout', transcript);
    expect(result.source).toBe('fallback');
  });
});
