import { describe, expect, it } from 'vitest';
import { correlate, type RawAxeFinding } from '../../src/baseline/correlate.js';

function finding(ruleId: string, targetSelector: string, overlapsBlocker = false, phase: 'load' | 'abandon' = 'load'): RawAxeFinding {
  return { phase, ruleId, impact: 'serious', wcagTags: [], description: ruleId, helpUrl: null, targetSelector, backendNodeId: null, overlapsBlocker };
}

const base = { goal: 'Complete checkout.', stepsUsed: 7, stepBudget: 20, category: 'UNLABELLED_CONTROL' as const };

describe('correlate', () => {
  it('says zero when no causal rule sits on the blocking element, and counts a violation seen at both phases once', () => {
    const result = correlate({
      ...base,
      status: 'BLOCKED',
      load: [finding('image-alt', 'img:nth-child(1)'), finding('color-contrast', '.price-note')],
      abandon: [finding('image-alt', 'img:nth-child(1)', false, 'abandon'), finding('label', 'input')],
    });
    expect(result?.axeViolationCount).toBe(3);
    expect(result?.blockerCaughtByAxe).toBe(false);
    expect(result?.verdict).toBe('axe-core reported 3 violations on this page. Zero of them was the reason the agent could not complete checkout.');
  });

  it('needs both a causal rule and an overlapping element before crediting axe', () => {
    const unrelatedRuleOnTheElement = correlate({ ...base, status: 'BLOCKED', load: [finding('region', '.card', true)], abandon: [] });
    expect(unrelatedRuleOnTheElement?.blockerCaughtByAxe).toBe(false);

    const caught = correlate({ ...base, status: 'BLOCKED', load: [finding('button-name', '.add', true), finding('label', 'input')], abandon: [] });
    expect(caught?.blockerCaughtByAxe).toBe(true);
    expect(caught?.findings.find((item) => item.ruleId === 'button-name')?.relatedToBlocker).toBe(true);
    expect(caught?.verdict).toMatch(/1 of them points at what stopped the agent/);
  });

  it('never gives a verdict without both scans, or for an errored run (no false zero)', () => {
    expect(correlate({ ...base, status: 'BLOCKED', load: null, abandon: [] })).toBeNull();
    expect(correlate({ ...base, status: 'BLOCKED', load: [], abandon: null })).toBeNull();
    expect(correlate({ ...base, status: 'ERRORED', load: [], abandon: [] })).toBeNull();
  });

  it('phrases success without crediting or blaming axe', () => {
    const result = correlate({ ...base, status: 'SUCCEEDED', category: null, load: [finding('label', 'input')], abandon: [] });
    expect(result?.verdict).toBe('The agent could complete checkout in 7 steps. axe-core still reported 1 violation, and none of them stopped a keyboard user.');
  });
});
