/**
 * declare_success is never trusted (F-13). A claim is accepted only with
 * positive evidence the agent could actually have perceived: a heading, status
 * or live announcement that confirms completion, or a URL change consistent
 * with it. Otherwise it is downgraded to BLOCKED / UNKNOWN with the claim kept
 * verbatim. A claim right after a suspected prompt injection is refused (X-03).
 */

import type { TranscriptLine } from '@ally/shared';

// Past tense and outcomes only. A bare "complete" would accept a heading such as
// "Complete your order", which is the instruction, not the confirmation.
const CONFIRMATION_TEXT =
  /\b(order (confirmed|placed|complete|received)|thank(s| you)|confirmed|success(ful|fully)?|completed|submitted|subscribed|booked|registered|has been (sent|placed|received|submitted))\b/i;

const CONFIRMATION_URL = /(confirm|success|thank|complete|receipt|done|order-placed)/i;

const EVIDENCE_ROLES = new Set(['heading', 'status', 'alert', 'RootWebArea']);

export interface ConfirmInput {
  evidence: string;
  /** Transcripts of the current step and the one before it. */
  recentLines: TranscriptLine[];
  startUrl: string;
  currentUrl: string;
}

export type ConfirmResult =
  | { confirmed: true; evidence: string }
  | { confirmed: false; reason: string };

function isEvidenceLine(line: TranscriptLine): boolean {
  return EVIDENCE_ROLES.has(line.role) || line.states.includes('announcement');
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

  return {
    confirmed: false,
    reason: `The agent claimed success, but nothing it perceived confirms it. Unconfirmed claim: "${claim}"`,
  };
}
