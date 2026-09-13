/** Loop detector — docs/10-TEST-CASES.md L-01 to L-04 (F-11). */

import { describe, expect, it } from 'vitest';
import { hashSnapshot } from '../../src/driver/hash.js';
import { LoopDetector } from '../../src/agent/loop-detect.js';
import { page, text } from '../helpers/ax.js';

describe('LoopDetector', () => {
  it('L-01 three identical state hashes is a loop', () => {
    const detector = new LoopDetector();
    expect(detector.observe('state-a', 'b1')).toBeNull();
    expect(detector.observe('state-a', 'b1')).toBeNull();
    expect(detector.observe('state-a', 'b1')).not.toBeNull();
  });

  it('L-02 two identical then a different one continues', () => {
    const detector = new LoopDetector();
    expect(detector.observe('state-a', 'b1')).toBeNull();
    expect(detector.observe('state-a', 'b1')).toBeNull();
    expect(detector.observe('state-b', 'b2')).toBeNull();
  });

  it('L-03 focus cycling A→B→A→B→A→B is a cycle even though hashes differ', () => {
    const detector = new LoopDetector();
    const trail = ['A', 'B', 'A', 'B', 'A', 'B'];
    const verdicts = trail.map((focus, i) => detector.observe(`unique-${i}`, focus));
    expect(verdicts.slice(0, -1).every((verdict) => verdict === null)).toBe(true);
    expect(verdicts.at(-1)?.category).toBe('NO_KEYBOARD_PATH');
  });

  it('a long Tab walk through distinct elements is not a cycle', () => {
    const detector = new LoopDetector();
    for (let i = 0; i < 30; i++) expect(detector.observe(`s${i}`, `focus-${i}`)).toBeNull();
  });

  it('L-04 a ticking clock does not let the agent escape the loop detector', () => {
    const withClock = (time: string) => page([{ role: 'button', name: 'Buy' }, { role: 'paragraph', children: [text(time)] }]);
    const hashes = ['10:00:01', '10:00:02', '10:00:03'].map((time) => hashSnapshot(withClock(time)));
    expect(new Set(hashes).size).toBe(1);

    const detector = new LoopDetector();
    const verdicts = hashes.map((hash) => detector.observe(hash, 'b1'));
    expect(verdicts.at(-1)).not.toBeNull();
  });

  it('live region contents do not change the hash (F-05)', () => {
    const withStatus = (message: string) => page([{ role: 'button', name: 'Buy' }, { role: 'status', children: [text(message)] }]);
    expect(hashSnapshot(withStatus('3 people viewing'))).toBe(hashSnapshot(withStatus('5 people viewing')));
  });
});
