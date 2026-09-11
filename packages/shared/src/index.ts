/**
 * @ally/shared — the seam between the frontend and the backend.
 *
 * If the frontend and the backend both know about a thing, its type is defined
 * HERE and imported by both. Never duplicate an interface across the two sides.
 *
 * Changing a type in this file requires telling the other two tracks before you
 * push it. See docs/13-TEAM-SPLIT.md.
 *
 * Day 1: add the matching zod schemas in ./schemas.ts and derive these types
 * from them, so runtime validation and compile-time types cannot drift.
 */

// ─── Enums, mirroring the Prisma schema in docs/04-DATA-MODEL.md ─────────────

export type RunStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'BLOCKED'
  | 'ABANDONED'
  | 'ERRORED';

export type RunSource = 'MANUAL' | 'CI' | 'BARRIER_REPORT' | 'VERIFY';

/** REPO_CONNECTED can open a pull request. URL_ONLY audits and suggests. */
export type RunMode = 'REPO_CONNECTED' | 'URL_ONLY';

export type StepKind = 'PERCEPTION' | 'NARRATION' | 'DECISION' | 'ACTION' | 'SYSTEM';

export type BlockerCategory =
  | 'UNLABELLED_CONTROL'
  | 'FOCUS_NOT_TRAPPED'
  | 'FOCUS_ORDER_BROKEN'
  | 'KEYBOARD_TRAP'
  | 'NO_KEYBOARD_PATH'
  | 'MEANINGLESS_NAME'
  | 'STATE_NOT_ANNOUNCED'
  | 'AMBIGUOUS_CONTROLS'
  | 'CONTENT_NOT_REACHABLE'
  | 'UNKNOWN';

// ─── The agent's entire action vocabulary ────────────────────────────────────
//
// This list is the product. Adding anything that carries a coordinate, a
// selector or a screenshot breaks the premise and fails the purity suite
// (P-1 to P-5 in docs/10-TEST-CASES.md).

export const ALLOWED_KEYS = [
  'Tab',
  'Shift+Tab',
  'Enter',
  'Space',
  'Escape',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
] as const;

export type AllowedKey = (typeof ALLOWED_KEYS)[number];

export type AgentTool =
  | { tool: 'press_key'; input: { key: AllowedKey } }
  | { tool: 'type_text'; input: { text: string } }
  | { tool: 'read_focus'; input: Record<string, never> }
  | { tool: 'declare_success'; input: { evidence: string } }
  | {
      tool: 'declare_blocked';
      input: { category: BlockerCategory; reason: string; axNodeId?: string };
    };

// ─── Perception ──────────────────────────────────────────────────────────────

/** One line a screen reader would speak. `spoken` is what gets synthesised. */
export interface TranscriptLine {
  axNodeId: string;
  role: string;
  name: string | null;
  value?: string | null;
  states: string[];
  level?: number;
  setSize?: number;
  posInSet?: number;
  /** The rendered sentence, e.g. "button, Add to cart." or just "button." */
  spoken: string;
  /** Set when the name is a filename, hash or URL. Feeds MEANINGLESS_NAME. */
  suspiciousName?: boolean;
  /** Set when the line looks like an instruction aimed at an assistant. F-14. */
  possibleInjection?: boolean;
}

// ─── API request and response shapes ─────────────────────────────────────────

export interface RunRequest {
  url: string;
  goal: string;
  stepBudget?: number;
  source?: RunSource;
  repo?: {
    owner: string;
    name: string;
    commitSha?: string;
    branch?: string;
  };
}

export interface RunSummary {
  id: string;
  url: string;
  goal: string;
  status: RunStatus;
  mode: RunMode;
  stepsUsed: number;
  stepBudget: number;
  durationMs: number | null;
  createdAt: string;
}

export interface SourceLocation {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  permalink?: string;
  locateMethod: 'data-attribute' | 'react-fiber' | 'ast-search';
  locateConfidence: number;
}

export interface BlockerInfo {
  atStep: number;
  category: BlockerCategory;
  summary: string;
  agentReasoning: string;
  axNodeId: string | null;
  backendNodeId: number | null;
  domPath: string | null;
  role: string | null;
  /** Frequently null. That absence IS the finding. */
  accessibleName: string | null;
  htmlSnippet: string | null;
  wcagCriteria: string[];
  source?: SourceLocation;
}

export interface AxeFindingInfo {
  phase: 'load' | 'abandon';
  ruleId: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical' | null;
  wcagTags: string[];
  description: string;
  helpUrl: string | null;
  targetSelector: string;
  backendNodeId: number | null;
  /** Set by correlate(). Usually false, and that is the headline. */
  relatedToBlocker: boolean;
}

export interface StepInfo {
  index: number;
  kind: StepKind;
  transcript?: TranscriptLine[];
  narration?: string;
  toolName?: string;
  toolInput?: unknown;
  reasoning?: string;
  confidence?: number;
  actionResult?: string;
  latencyMs?: number;
}

export interface RunReport extends RunSummary {
  /** Null until BOTH axe phases have completed. Never render a false zero. */
  blockerCaughtByAxe: boolean | null;
  axeViolationCount: number | null;
  /** The sentence we say on stage. Null while correlation is pending. */
  verdict: string | null;
  blocker: BlockerInfo | null;
  axeFindings: AxeFindingInfo[];
  steps: StepInfo[];
  patch: PatchInfo | null;
  pullRequest: PullRequestInfo | null;
  verifyRun: RunSummary | null;
  cost: { inputTokens: number; outputTokens: number; usd: string };
}

export interface PatchInfo {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  diff: string;
  rationale: string;
  linesChanged: number;
  /** False means this is a SUGGESTION and must never be shown as a fix. F-33. */
  validated: boolean;
  gateResults: {
    appliesCleanly: boolean;
    parses: boolean;
    typechecks: boolean;
    jsxA11y: boolean;
    sizeOk: boolean;
  };
  attempts: number;
}

export interface PullRequestInfo {
  owner: string;
  repo: string;
  number: number;
  url: string;
  branch: string;
  state: 'open' | 'merged' | 'closed';
  /** A PR whose verify run failed is labelled ally:unverified. F-33. */
  verified: boolean;
}

// ─── Server-sent events ──────────────────────────────────────────────────────
// Documented in docs/05-API-CONTRACT.md. Keep the two in sync.

export type StreamEvent =
  | { event: 'run.started'; data: { runId: string; url: string; goal: string; stepBudget: number } }
  | { event: 'step.perception'; data: { index: number; lines: TranscriptLine[]; speak: boolean } }
  | { event: 'step.narration'; data: { index: number; text: string } }
  | {
      event: 'step.decision';
      data: { index: number; tool: string; input: unknown; reasoning: string; confidence: number };
    }
  | { event: 'step.action'; data: { index: number; result: string; latencyMs: number } }
  | { event: 'step.warning'; data: { index: number; text: string } }
  | { event: 'run.blocked'; data: Pick<BlockerInfo, 'atStep' | 'category' | 'summary' | 'wcagCriteria'> }
  | { event: 'run.succeeded'; data: { stepsUsed: number; evidence: string } }
  | {
      event: 'run.correlated';
      data: { axeViolationCount: number; blockerCaughtByAxe: boolean; verdict: string };
    }
  | { event: 'run.errored'; data: { message: string; code: string } }
  | {
      event: 'run.finished';
      data: { status: RunStatus; stepsUsed: number; durationMs: number; reportUrl: string };
    }
  | { event: 'fix.stage'; data: { stage: 'locate' | 'read' | 'generate' | 'validate' | 'pr'; status: 'running' | 'done' | 'failed' } }
  | { event: 'fix.located'; data: SourceLocation }
  | { event: 'fix.generated'; data: { diff: string; linesChanged: number; rationale: string } }
  | { event: 'fix.validated'; data: { passed: boolean; gates: PatchInfo['gateResults']; attempts: number } }
  | { event: 'fix.pr'; data: PullRequestInfo }
  | { event: 'fix.verifying'; data: { verifyRunId: string; liveUrl: string } }
  | { event: 'fix.verified'; data: { success: boolean; stepsUsed: number; before: number; after: number } }
  | { event: 'fix.failed'; data: { stage: string; reason: string; suggestedDiff: string | null } };

// ─── Barrier Report ──────────────────────────────────────────────────────────

export interface BarrierSubmission {
  rawText: string;
  inputMethod: 'typed' | 'spoken';
  contactEmail?: string;
}

export interface BarrierExtraction {
  url: string | null;
  goal: string | null;
  expectedFailure: string | null;
  assistiveTech: string | null;
}

/**
 * NOT_REPRODUCED is never phrased as "could not reproduce" in the UI. A barrier
 * report is never silently discarded. See F-43.
 */
export type BarrierOutcome = 'PENDING' | 'REPRODUCED' | 'NOT_REPRODUCED' | 'DIFFERENT_WALL';

// ─── Errors ──────────────────────────────────────────────────────────────────

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'INVALID_URL'
  | 'RUN_NOT_FOUND'
  | 'RUN_NOT_BLOCKED'
  | 'REPO_NOT_CONNECTED'
  | 'PATCH_VALIDATION_FAILED'
  | 'GITHUB_PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'UPSTREAM_TIMEOUT';

export interface ApiError {
  error: { code: ErrorCode; message: string; details?: Record<string, unknown> };
}
