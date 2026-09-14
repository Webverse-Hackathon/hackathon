/**
 * The comparison we say out loud: what axe reported, against what actually
 * stopped the agent. Pure, so the sentence is unit tested.
 *
 * Invariant (docs/04): no verdict until both axe phases have completed. The
 * caller passes null findings when either scan failed, and gets a null verdict.
 */

import type { AxeFindingInfo, BlockerCategory, RunStatus } from '@ally/shared';
import { CAUSAL_RULES } from './causal-map.js';

export interface RawAxeFinding extends Omit<AxeFindingInfo, 'relatedToBlocker'> {
  /** The finding's element is the blocking element, inside it, or contains it. */
  overlapsBlocker: boolean;
}

export interface CorrelationInput {
  status: RunStatus;
  goal: string;
  stepsUsed: number;
  stepBudget: number;
  category: BlockerCategory | null;
  load: RawAxeFinding[] | null;
  abandon: RawAxeFinding[] | null;
}

export interface Correlation {
  findings: AxeFindingInfo[];
  axeViolationCount: number;
  blockerCaughtByAxe: boolean;
  verdict: string;
}

function goalPhrase(goal: string): string {
  const trimmed = goal.trim().replace(/[.!]+$/, '');
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function correlate(input: CorrelationInput): Correlation | null {
  if (input.load === null || input.abandon === null) return null;

  const causal = new Set(input.category ? CAUSAL_RULES[input.category] : []);
  const findings: AxeFindingInfo[] = [];
  // One violation is one rule on one element. The same one seen at both phases counts once.
  const seen = new Set<string>();
  for (const raw of [...input.load, ...input.abandon]) {
    const { overlapsBlocker, ...finding } = raw;
    const key = `${finding.ruleId}|${finding.targetSelector}`;
    const related = input.status === 'BLOCKED' && overlapsBlocker && causal.has(finding.ruleId);
    if (seen.has(key)) {
      if (related) {
        const existing = findings.find((item) => `${item.ruleId}|${item.targetSelector}` === key);
        if (existing) existing.relatedToBlocker = true;
      }
      continue;
    }
    seen.add(key);
    findings.push({ ...finding, relatedToBlocker: related });
  }

  const count = findings.length;
  const related = findings.filter((finding) => finding.relatedToBlocker).length;
  const violations = plural(count, 'violation', 'violations');
  const goal = goalPhrase(input.goal);

  let verdict: string;
  switch (input.status) {
    case 'BLOCKED':
      verdict =
        related === 0
          ? `axe-core reported ${violations} on this page. Zero of them was the reason the agent could not ${goal}.`
          : `axe-core reported ${violations} on this page, and ${related} of them points at what stopped the agent. The other ${count - related} had nothing to do with the goal.`;
      break;
    case 'SUCCEEDED':
      verdict = `The agent could ${goal} in ${plural(input.stepsUsed, 'step', 'steps')}. axe-core still reported ${violations}, and none of them stopped a keyboard user.`;
      break;
    case 'ABANDONED':
      verdict = `The agent used all ${input.stepBudget} steps without reaching a conclusion. axe-core reported ${violations} on this page.`;
      break;
    default:
      return null;
  }

  return { findings, axeViolationCount: count, blockerCaughtByAxe: related > 0, verdict };
}
