/**
 * declare_success is never trusted (F-13). A claim is accepted only with
 * positive evidence the agent could actually have perceived: a heading, status
 * or live announcement that confirms completion, a URL change consistent with
 * it, or, for an add-to-cart goal, a cart count the agent heard rise after it
 * activated something (DECISIONS.md #18). Otherwise it is downgraded to
 * BLOCKED / UNKNOWN with the claim kept verbatim. A claim right after a
 * suspected prompt injection is refused (X-03).
 */

import type { StepInfo, TranscriptLine } from '@ally/shared';

// Past tense and outcomes only. A bare "complete" would accept a heading such as
// "Complete your order", which is the instruction, not the confirmation.
export const CONFIRMATION_TEXT =
  /\b(order (confirmed|placed|complete|received)|thank(s| you)|confirmed|success(ful|fully)?|completed|submitted|subscribed|booked|registered|has been (sent|placed|received|submitted))\b/i;

const CONFIRMATION_URL = /(confirm|success|thank|complete|receipt|done|order-placed)/i;

const EVIDENCE_ROLES = new Set(['heading', 'status', 'alert', 'RootWebArea']);

/** "add a shirt to the cart", "put two mugs in my basket". */
const CART_GOAL = /\b(add|put|place)\b[^.]*\b(cart|bag|basket|trolley)\b/i;

/** "Cart (1)", "Cart, 2 items", "Bag: 3", "1 item in your cart". Not "Basket total $48". */
const CART_COUNT = [
  /\b(?:cart|bag|basket|trolley)\b[\s(:,–-]{0,3}(\d+)/i,
  /\b(\d+)\s+items?\s+in\s+(?:your\s+|the\s+)?(?:cart|bag|basket|trolley)\b/i,
];

/** Where a cart count is something the user reaches or is told, not body copy. */
const COUNT_ROLES = new Set(['button', 'link', 'status', 'alert']);

const ACTIVATION_KEYS = new Set(['Enter', 'Space']);

export interface ConfirmInput {
  evidence: string;
  /** Transcripts of the current step and the one before it. */
  recentLines: TranscriptLine[];
  startUrl: string;
  currentUrl: string;
  /** The run's goal. Needed for the cart-count rule; without it that rule is off. */
  goal?: string;
  /** Every step so far, in order, including the current one. Needed for the cart-count rule. */
  steps?: StepInfo[];
}

export type ConfirmResult =
  | { confirmed: true; evidence: string }
  | { confirmed: false; reason: string };

function isEvidenceLine(line: TranscriptLine): boolean {
  return EVIDENCE_ROLES.has(line.role) || line.states.includes('announcement');
}

function isAnnouncement(line: TranscriptLine): boolean {
  return line.role === 'status' || line.role === 'alert' || line.states.includes('announcement');
}

function cartCount(line: TranscriptLine): number | null {
  if (!COUNT_ROLES.has(line.role) && !line.states.includes('announcement')) return null;
  for (const pattern of CART_COUNT) {
    const match = pattern.exec(line.spoken);
    if (match?.[1] !== undefined) return Number(match[1]);
  }
  return null;
}

/** The last cart count in what was perceived at one step. */
function countAt(step: StepInfo | undefined): number | null {
  let count: number | null = null;
  for (const line of step?.transcript ?? []) count = cartCount(line) ?? count;
  return count;
}

function pressedKey(step: StepInfo): string | null {
  if (step.toolName !== 'press_key') return null;
  const input = step.toolInput;
  if (typeof input !== 'object' || input === null || !('key' in input)) return null;
  return typeof input.key === 'string' ? input.key : null;
}

/**
 * Add-to-cart goals only. The count must be heard at this step or the one before,
 * an Enter or Space must come after the last lower reading, and the count must
 * have risen across it. The model's own evidence text is never read. A cart that
 * already said 1 at the start proves nothing, and neither does a count with no
 * activation before it.
 */
function cartCountRose(goal: string, steps: StepInfo[]): string | null {
  if (!CART_GOAL.test(goal)) return null;

  let finalAt = -1;
  for (let i = steps.length - 1; i >= Math.max(0, steps.length - 2); i--) {
    if (countAt(steps[i]) !== null) {
      finalAt = i;
      break;
    }
  }
  const after = countAt(steps[finalAt]);
  if (after === null) return null;

  let activatedAt = -1;
  for (let i = finalAt - 1; i >= 0; i--) {
    const key = pressedKey(steps[i]!);
    if (key !== null && ACTIVATION_KEYS.has(key)) {
      activatedAt = i;
      break;
    }
  }
  if (activatedAt < 0) return null;

  let before: number | null = null;
  for (let i = activatedAt; i >= 0 && before === null; i--) before = countAt(steps[i]);
  if (before === null || after <= before) return null;

  const key = pressedKey(steps[activatedAt]!);
  const announced = steps.slice(activatedAt + 1, finalAt + 1).some((step) => (step.transcript ?? []).some(isAnnouncement));
  const evidence = `The cart count went from ${before} to ${after} after pressing ${key}.`;
  return announced
    ? evidence
    : `${evidence} Nothing announced it: a screen-reader user has to go and find the count (WCAG 4.1.3 Status Messages).`;
}

export function confirmSuccess(input: ConfirmInput): ConfirmResult {
  const claim = input.evidence.trim();

  if (input.recentLines.some((line) => line.possibleInjection)) {
    return {
      confirmed: false,
      reason: `Success was claimed right after page text that looked like an instruction to the agent. Claim refused: "${claim}"`,
    };
  }

  const confirming = input.recentLines.find((line) => isEvidenceLine(line) && CONFIRMATION_TEXT.test(line.spoken));
  if (confirming) return { confirmed: true, evidence: confirming.spoken };

  const path = (url: string) => {
    try {
      const parsed = new URL(url);
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return url;
    }
  };
  if (path(input.currentUrl) !== path(input.startUrl) && CONFIRMATION_URL.test(path(input.currentUrl))) {
    return { confirmed: true, evidence: `The page changed to ${path(input.currentUrl)}.` };
  }

  const cart = input.goal && input.steps ? cartCountRose(input.goal, input.steps) : null;
  if (cart) return { confirmed: true, evidence: cart };

  return {
    confirmed: false,
    reason: `The agent claimed success, but nothing it perceived confirms it. Unconfirmed claim: "${claim}"`,
  };
}
