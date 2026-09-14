/** F-84: which runs look for a result shown on screen but never announced. */

import type { StepInfo, TranscriptLine } from '@ally/shared';
import { describe, expect, it } from 'vitest';
import { NOTHING_ANNOUNCED_LINE } from '../../src/driver/serialize.js';
import { silentActivation } from '../../src/runs/execute.js';

const heard = (spoken: string): TranscriptLine => ({ axNodeId: '1', role: 'button', name: null, states: [], spoken });

const step = (index: number, spoken: string, key?: string): StepInfo => ({
  index,
  kind: 'DECISION',
  transcript: [heard(spoken)],
  ...(key ? { toolName: 'press_key' as const, toolInput: { key } } : {}),
});

describe('silentActivation', () => {
  it('is true when Enter on a control was followed by nothing announced', () => {
    expect(silentActivation([step(1, 'button, Subscribe.', 'Enter'), step(2, NOTHING_ANNOUNCED_LINE, 'Tab')])).toBe(true);
  });

  it('is false when the activation was announced', () => {
    expect(silentActivation([step(1, 'button, Subscribe.', 'Space'), step(2, 'Thanks, you are subscribed.')])).toBe(false);
  });

  it('is false when only a Tab heard nothing new', () => {
    expect(silentActivation([step(1, 'link, Journal.', 'Tab'), step(2, NOTHING_ANNOUNCED_LINE)])).toBe(false);
  });
});
