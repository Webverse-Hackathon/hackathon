/**
 * zod schemas for every shape that crosses a boundary: agent tool calls, the
 * API, the SSE stream. Every type is derived from its schema with z.infer, so
 * runtime validation and compile-time types cannot drift.
 *
 * Documented in docs/05-API-CONTRACT.md and docs/06-AGENT-LOOP.md. Enums
 * mirror the Prisma schema in docs/04-DATA-MODEL.md. Keep all three in sync.
 */

import { z } from 'zod';

// ─── Enums, mirroring the Prisma schema in docs/04-DATA-MODEL.md ─────────────

export const RunStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'BLOCKED',
  'ABANDONED',
  'ERRORED',
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const RunSourceSchema = z.enum(['MANUAL', 'CI', 'BARRIER_REPORT', 'VERIFY']);
export type RunSource = z.infer<typeof RunSourceSchema>;

/** REPO_CONNECTED can open a pull request. URL_ONLY audits and suggests. */
export const RunModeSchema = z.enum(['REPO_CONNECTED', 'URL_ONLY']);
export type RunMode = z.infer<typeof RunModeSchema>;

export const StepKindSchema = z.enum(['PERCEPTION', 'NARRATION', 'DECISION', 'ACTION', 'SYSTEM']);
export type StepKind = z.infer<typeof StepKindSchema>;

export const BlockerCategorySchema = z.enum([
  'UNLABELLED_CONTROL',
  'FOCUS_NOT_TRAPPED',
  'FOCUS_ORDER_BROKEN',
  'KEYBOARD_TRAP',
  'NO_KEYBOARD_PATH',
  'MEANINGLESS_NAME',
  'STATE_NOT_ANNOUNCED',
  'AMBIGUOUS_CONTROLS',
  'CONTENT_NOT_REACHABLE',
  'UNKNOWN',
]);
export type BlockerCategory = z.infer<typeof BlockerCategorySchema>;

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

export const AllowedKeySchema = z.enum(ALLOWED_KEYS);
export type AllowedKey = z.infer<typeof AllowedKeySchema>;

/** type_text accepts at most this many characters. P-5. */
export const TYPE_TEXT_MAX_LENGTH = 200;

export const AGENT_TOOL_NAMES = [
  'press_key',
  'type_text',
  'read_focus',
  'declare_success',
  'declare_blocked',
] as const;

export const AgentToolNameSchema = z.enum(AGENT_TOOL_NAMES);
export type AgentToolName = z.infer<typeof AgentToolNameSchema>;

// Every object is strict: an unknown field in a tool call is rejected rather
// than silently carried through, so nothing coordinate-shaped can ride along.
export const AgentToolSchema = z.discriminatedUnion('tool', [
  z.object({ tool: z.literal('press_key'), input: z.object({ key: AllowedKeySchema }).strict() }).strict(),
  z
    .object({
      tool: z.literal('type_text'),
      input: z.object({ text: z.string().max(TYPE_TEXT_MAX_LENGTH) }).strict(),
    })
    .strict(),
  z.object({ tool: z.literal('read_focus'), input: z.object({}).strict() }).strict(),
  z
    .object({ tool: z.literal('declare_success'), input: z.object({ evidence: z.string().min(1) }).strict() })
    .strict(),
  z
    .object({
      tool: z.literal('declare_blocked'),
      input: z
        .object({
          category: BlockerCategorySchema,
          reason: z.string().min(1),
          axNodeId: z.string().optional(),
        })
        .strict(),
    })
    .strict(),
]);
export type AgentTool = z.infer<typeof AgentToolSchema>;

// ─── Perception ──────────────────────────────────────────────────────────────

/** One line a screen reader would speak. `spoken` is what gets synthesised. */
export const TranscriptLineSchema = z.object({
  axNodeId: z.string(),
  role: z.string(),
  name: z.string().nullable(),
  value: z.string().nullable().optional(),
  states: z.array(z.string()),
  level: z.number().int().optional(),
  setSize: z.number().int().optional(),
  posInSet: z.number().int().optional(),
  /** The rendered sentence, e.g. "button, Add to cart." or just "button." */
  spoken: z.string(),
  /** Set when the name is a filename, hash or URL. Feeds MEANINGLESS_NAME. */
  suspiciousName: z.boolean().optional(),
  /** Set when the line looks like an instruction aimed at an assistant. F-14. */
  possibleInjection: z.boolean().optional(),
});
export type TranscriptLine = z.infer<typeof TranscriptLineSchema>;

// ─── API request and response shapes ─────────────────────────────────────────

export const RepoRefSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  commitSha: z.string().optional(),
  branch: z.string().optional(),
});
export type RepoRef = z.infer<typeof RepoRefSchema>;

export const STEP_BUDGET_DEFAULT = 20;
export const STEP_BUDGET_MAX = 50;

/**
 * Only the protocol is checked here. The private-range check needs DNS and
 * lives in backend/src/lib/url-guard.ts (F-01).
 */
const HttpUrlSchema = z.string().refine(
  (value) => {
    // zod still runs a refine after .url() fails, so parse defensively here.
    try {
      return /^https?:$/.test(new URL(value).protocol);
    } catch {
      return false;
    }
  },
  { message: 'URL must be a valid http or https address.' },
);

export const RunRequestSchema = z.object({
  url: HttpUrlSchema,
  goal: z.string().trim().min(3).max(200),
  stepBudget: z.number().int().min(1).max(STEP_BUDGET_MAX).optional(),
  /** VERIFY runs are created by the fix flow, never requested directly. */
  source: RunSourceSchema.exclude(['VERIFY']).optional(),
  /** Presence selects Mode A. */
  repo: RepoRefSchema.optional(),
});
export type RunRequest = z.infer<typeof RunRequestSchema>;

/** Response to POST /api/runs and POST /api/runs/:id/rerun. */
export const RunCreatedSchema = z.object({
  id: z.string(),
  status: RunStatusSchema,
  mode: RunModeSchema,
  streamUrl: z.string(),
  liveUrl: z.string(),
  createdAt: z.string().datetime(),
});
export type RunCreated = z.infer<typeof RunCreatedSchema>;

export const RunSummarySchema = z.object({
  id: z.string(),
  url: z.string(),
  goal: z.string(),
  status: RunStatusSchema,
  mode: RunModeSchema,
  stepsUsed: z.number().int(),
  stepBudget: z.number().int(),
  durationMs: z.number().int().nullable(),
  createdAt: z.string().datetime(),
});
export type RunSummary = z.infer<typeof RunSummarySchema>;

/** Query for GET /api/runs. */
export const RunListQuerySchema = z.object({
  status: RunStatusSchema.optional(),
  /** "owner/name" */
  repo: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type RunListQuery = z.infer<typeof RunListQuerySchema>;

export const RunListResponseSchema = z.object({
  runs: z.array(RunSummarySchema),
  nextCursor: z.string().nullable(),
});
export type RunListResponse = z.infer<typeof RunListResponseSchema>;

export const LocateMethodSchema = z.enum(['data-attribute', 'react-fiber', 'ast-search']);
export type LocateMethod = z.infer<typeof LocateMethodSchema>;

/** Below this, fix.located pauses for POST /api/runs/:id/fix/confirm. */
export const LOCATE_CONFIDENCE_THRESHOLD = 0.8;

export const SourceLocationSchema = z.object({
  filePath: z.string(),
  lineStart: z.number().int(),
  lineEnd: z.number().int(),
  permalink: z.string().optional(),
  locateMethod: LocateMethodSchema,
  locateConfidence: z.number().min(0).max(1),
});
export type SourceLocation = z.infer<typeof SourceLocationSchema>;

export const BlockerInfoSchema = z.object({
  atStep: z.number().int(),
  category: BlockerCategorySchema,
  summary: z.string(),
  agentReasoning: z.string(),
  axNodeId: z.string().nullable(),
  backendNodeId: z.number().int().nullable(),
  domPath: z.string().nullable(),
  role: z.string().nullable(),
  /** Frequently null. That absence IS the finding. */
  accessibleName: z.string().nullable(),
  htmlSnippet: z.string().nullable(),
  wcagCriteria: z.array(z.string()),
  source: SourceLocationSchema.optional(),
});
export type BlockerInfo = z.infer<typeof BlockerInfoSchema>;

export const AxeFindingInfoSchema = z.object({
  phase: z.enum(['load', 'abandon']),
  ruleId: z.string(),
  impact: z.enum(['minor', 'moderate', 'serious', 'critical']).nullable(),
  wcagTags: z.array(z.string()),
  description: z.string(),
  helpUrl: z.string().nullable(),
  targetSelector: z.string(),
  backendNodeId: z.number().int().nullable(),
  /** Set by correlate(). Usually false, and that is the headline. */
  relatedToBlocker: z.boolean(),
});
export type AxeFindingInfo = z.infer<typeof AxeFindingInfoSchema>;

export const StepInfoSchema = z.object({
  /** 1-based and contiguous within a run. */
  index: z.number().int().min(1),
  kind: StepKindSchema,
  transcript: z.array(TranscriptLineSchema).optional(),
  /** sha256 of the normalised AX tree, for loop detection. */
  axStateHash: z.string().optional(),
  narration: z.string().optional(),
  toolName: AgentToolNameSchema.optional(),
  toolInput: z.unknown().optional(),
  reasoning: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  actionResult: z.string().optional(),
  latencyMs: z.number().int().optional(),
});
export type StepInfo = z.infer<typeof StepInfoSchema>;

export const PatchGateResultsSchema = z.object({
  appliesCleanly: z.boolean(),
  parses: z.boolean(),
  typechecks: z.boolean(),
  jsxA11y: z.boolean(),
  sizeOk: z.boolean(),
});
export type PatchGateResults = z.infer<typeof PatchGateResultsSchema>;

export const PatchInfoSchema = z.object({
  filePath: z.string(),
  lineStart: z.number().int(),
  lineEnd: z.number().int(),
  diff: z.string(),
  rationale: z.string(),
  linesChanged: z.number().int(),
  /** False means this is a SUGGESTION and must never be shown as a fix. F-33. */
  validated: z.boolean(),
  gateResults: PatchGateResultsSchema,
  attempts: z.number().int().min(1),
});
export type PatchInfo = z.infer<typeof PatchInfoSchema>;

export const PullRequestInfoSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  number: z.number().int(),
  url: z.string(),
  branch: z.string(),
  state: z.enum(['open', 'merged', 'closed']),
  /** A PR whose verify run failed is labelled ally:unverified. F-33. */
  verified: z.boolean(),
});
export type PullRequestInfo = z.infer<typeof PullRequestInfoSchema>;

export const RunReportSchema = RunSummarySchema.extend({
  /** Null until BOTH axe phases have completed. Never render a false zero. */
  blockerCaughtByAxe: z.boolean().nullable(),
  axeViolationCount: z.number().int().nullable(),
  /** The sentence we say on stage. Null while correlation is pending. */
  verdict: z.string().nullable(),
  blocker: BlockerInfoSchema.nullable(),
  axeFindings: z.array(AxeFindingInfoSchema),
  steps: z.array(StepInfoSchema),
  patch: PatchInfoSchema.nullable(),
  pullRequest: PullRequestInfoSchema.nullable(),
  verifyRun: RunSummarySchema.nullable(),
  cost: z.object({
    inputTokens: z.number().int(),
    outputTokens: z.number().int(),
    /** Decimal string, e.g. "0.184320". Never a float. */
    usd: z.string(),
  }),
});
export type RunReport = z.infer<typeof RunReportSchema>;

/** Response to POST /api/runs/:id/fix. */
export const FixStartedSchema = z.object({
  runId: z.string(),
  status: z.literal('FIXING'),
  streamUrl: z.string(),
});
export type FixStarted = z.infer<typeof FixStartedSchema>;

export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.enum(['ok', 'down']),
  redis: z.enum(['ok', 'down']),
  queueDepth: z.number().int(),
  browserPoolFree: z.number().int(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// ─── Server-sent events ──────────────────────────────────────────────────────
// Documented in docs/05-API-CONTRACT.md. Keep the two in sync.

export const FixStageSchema = z.enum(['locate', 'read', 'generate', 'validate', 'pr']);
export type FixStage = z.infer<typeof FixStageSchema>;

export const StreamEventSchema = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('run.started'),
    data: z.object({ runId: z.string(), url: z.string(), goal: z.string(), stepBudget: z.number().int() }),
  }),
  z.object({
    event: z.literal('step.perception'),
    data: z.object({ index: z.number().int(), lines: z.array(TranscriptLineSchema), speak: z.boolean() }),
  }),
  z.object({
    event: z.literal('step.narration'),
    data: z.object({ index: z.number().int(), text: z.string() }),
  }),
  z.object({
    event: z.literal('step.decision'),
    data: z.object({
      index: z.number().int(),
      tool: AgentToolNameSchema,
      input: z.unknown(),
      reasoning: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  }),
  z.object({
    event: z.literal('step.action'),
    data: z.object({ index: z.number().int(), result: z.string(), latencyMs: z.number().int() }),
  }),
  z.object({
    event: z.literal('step.warning'),
    data: z.object({ index: z.number().int(), text: z.string() }),
  }),
  z.object({
    event: z.literal('run.blocked'),
    data: BlockerInfoSchema.pick({ atStep: true, category: true, summary: true, wcagCriteria: true }),
  }),
  z.object({
    event: z.literal('run.succeeded'),
    data: z.object({ stepsUsed: z.number().int(), evidence: z.string() }),
  }),
  z.object({
    event: z.literal('run.correlated'),
    data: z.object({
      axeViolationCount: z.number().int(),
      blockerCaughtByAxe: z.boolean(),
      verdict: z.string(),
    }),
  }),
  z.object({
    event: z.literal('run.errored'),
    data: z.object({ message: z.string(), code: z.string() }),
  }),
  z.object({
    event: z.literal('run.finished'),
    data: z.object({
      status: RunStatusSchema,
      stepsUsed: z.number().int(),
      durationMs: z.number().int(),
      reportUrl: z.string(),
    }),
  }),
  z.object({
    event: z.literal('fix.stage'),
    data: z.object({ stage: FixStageSchema, status: z.enum(['running', 'done', 'failed']) }),
  }),
  z.object({ event: z.literal('fix.located'), data: SourceLocationSchema }),
  z.object({
    event: z.literal('fix.generated'),
    data: z.object({ diff: z.string(), linesChanged: z.number().int(), rationale: z.string() }),
  }),
  z.object({
    event: z.literal('fix.validated'),
    data: z.object({ passed: z.boolean(), gates: PatchGateResultsSchema, attempts: z.number().int() }),
  }),
  z.object({ event: z.literal('fix.pr'), data: PullRequestInfoSchema }),
  z.object({
    event: z.literal('fix.verifying'),
    data: z.object({ verifyRunId: z.string(), liveUrl: z.string() }),
  }),
  z.object({
    event: z.literal('fix.verified'),
    data: z.object({
      success: z.boolean(),
      stepsUsed: z.number().int(),
      before: z.number().int(),
      after: z.number().int(),
    }),
  }),
  z.object({
    event: z.literal('fix.failed'),
    data: z.object({ stage: z.string(), reason: z.string(), suggestedDiff: z.string().nullable() }),
  }),
]);
export type StreamEvent = z.infer<typeof StreamEventSchema>;
export type StreamEventName = StreamEvent['event'];

// ─── Barrier Report ──────────────────────────────────────────────────────────

export const BarrierSubmissionSchema = z.object({
  /** Stored exactly as given. Never trimmed or paraphrased. Invariant 6. */
  rawText: z.string().min(1),
  inputMethod: z.enum(['typed', 'spoken']),
  contactEmail: z.string().email().optional(),
});
export type BarrierSubmission = z.infer<typeof BarrierSubmissionSchema>;

export const BarrierExtractionSchema = z.object({
  url: z.string().nullable(),
  goal: z.string().nullable(),
  expectedFailure: z.string().nullable(),
  assistiveTech: z.string().nullable(),
});
export type BarrierExtraction = z.infer<typeof BarrierExtractionSchema>;

/** Response to POST /api/barriers. */
export const BarrierSubmittedSchema = z.object({
  id: z.string(),
  extraction: BarrierExtractionSchema,
  confirmPrompt: z.string(),
  confirmed: z.boolean(),
});
export type BarrierSubmitted = z.infer<typeof BarrierSubmittedSchema>;

/** Body of POST /api/barriers/:id/confirm, including any reporter corrections. */
export const BarrierConfirmSchema = RunRequestSchema.pick({ url: true, goal: true });
export type BarrierConfirm = z.infer<typeof BarrierConfirmSchema>;

/** Response to POST /api/barriers/:id/confirm. */
export const BarrierConfirmedSchema = z.object({
  id: z.string(),
  runId: z.string(),
  liveUrl: z.string(),
});
export type BarrierConfirmed = z.infer<typeof BarrierConfirmedSchema>;

/**
 * NOT_REPRODUCED is never phrased as "could not reproduce" in the UI. A barrier
 * report is never silently discarded. See F-43.
 */
export const BarrierOutcomeSchema = z.enum(['PENDING', 'REPRODUCED', 'NOT_REPRODUCED', 'DIFFERENT_WALL']);
export type BarrierOutcome = z.infer<typeof BarrierOutcomeSchema>;

// ─── Errors ──────────────────────────────────────────────────────────────────

export const ErrorCodeSchema = z.enum([
  'VALIDATION_FAILED',
  'INVALID_URL',
  'RUN_NOT_FOUND',
  'RUN_NOT_BLOCKED',
  'REPO_NOT_CONNECTED',
  'PATCH_VALIDATION_FAILED',
  'GITHUB_PERMISSION_DENIED',
  'RATE_LIMITED',
  'UPSTREAM_TIMEOUT',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
