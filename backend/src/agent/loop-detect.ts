/**
 * Loop detection (F-11), checked before the decision call so it costs nothing.
 *  - The same normalised AX state three times.
 *  - Focus cycling through the same two to five elements three times over,
 *    even when the tree hash changes each time.
 */

import type { BlockerCategory } from '@ally/shared';

export const REPEAT_LIMIT = 3;
const MIN_CYCLE = 2;
const MAX_CYCLE = 5;

export interface LoopVerdict {
  category: BlockerCategory;
  reason: string;
}

export class LoopDetector {
  private readonly seen = new Map<string, number>();
  private readonly focusTrail: string[] = [];

  /** Record one step's state. Returns a verdict when the agent is looping. */
  observe(stateHash: string, focusKey: string | null): LoopVerdict | null {
    const times = (this.seen.get(stateHash) ?? 0) + 1;
    this.seen.set(stateHash, times);
    if (times >= REPEAT_LIMIT) {
      return {
        category: 'AMBIGUOUS_CONTROLS',
        reason: `The page returned to the same state ${times} times; nothing the agent tried from here made progress.`,
      };
    }

    if (focusKey !== null) {
      this.focusTrail.push(focusKey);
      const cycle = this.cycleLength();
      if (cycle !== null) {
        return {
          category: 'NO_KEYBOARD_PATH',
          reason: `Focus cycled through the same ${cycle} elements ${REPEAT_LIMIT} times without reaching anything new.`,
        };
      }
    }
    return null;
  }

  private cycleLength(): number | null {
    const trail = this.focusTrail;
    for (let length = MIN_CYCLE; length <= MAX_CYCLE; length++) {
      if (trail.length < length * REPEAT_LIMIT) continue;
      const tail = trail.slice(-length * REPEAT_LIMIT);
      const block = tail.slice(0, length);
      if (new Set(block).size < 2) continue;
      const repeats = tail.every((key, index) => key === block[index % length]);
      if (repeats) return length;
    }
    return null;
  }
}
