import type {
  BlockerCategory,
  FixStage,
  PatchGateResults,
  PullRequestInfo,
  RunStatus,
  SourceLocation,
  StreamEvent,
  TranscriptLine,
} from '@ally/shared';

export interface StepView {
  index: number;
  lines: TranscriptLine[];
  narration: string | null;
  decision: { tool: string; input?: unknown; reasoning: string; confidence: number } | null;
  result: string | null;
  latencyMs: number | null;
  warnings: string[];
}

export type StageStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface FixView {
  stages: Record<FixStage | 'verify', { status: StageStatus; detail: string | null }>;
  located: SourceLocation | null;
  diff: string | null;
  rationale: string | null;
  linesChanged: number | null;
  gates: PatchGateResults | null;
  passed: boolean | null;
  attempts: number | null;
  pullRequest: PullRequestInfo | null;
  verifyRunId: string | null;
  verified: { success: boolean; stepsUsed: number; before: number; after: number } | null;
  failure: { stage: string; reason: string; suggestedDiff: string | null } | null;
}

export interface LiveState {
  runId: string;
  url: string | null;
  goal: string | null;
  stepBudget: number | null;
  status: RunStatus;
  steps: StepView[];
  blocked: { atStep: number; category: BlockerCategory; summary: string; wcagCriteria: string[] } | null;
  succeeded: { stepsUsed: number; evidence: string } | null;
  errored: { message: string; code: string } | null;
  correlated: { axeViolationCount: number; blockerCaughtByAxe: boolean; verdict: string } | null;
  finished: { status: RunStatus; stepsUsed: number; durationMs: number } | null;
  fix: FixView | null;
}

export function initialState(runId: string): LiveState {
  return {
    runId,
    url: null,
    goal: null,
    stepBudget: null,
    status: 'QUEUED',
    steps: [],
    blocked: null,
    succeeded: null,
    errored: null,
    correlated: null,
    finished: null,
    fix: null,
  };
}

function emptyFix(): FixView {
  const pending = { status: 'pending' as const, detail: null };
  return {
    stages: { locate: pending, read: pending, generate: pending, validate: pending, pr: pending, verify: pending },
    located: null,
    diff: null,
    rationale: null,
    linesChanged: null,
    gates: null,
    passed: null,
    attempts: null,
    pullRequest: null,
    verifyRunId: null,
    verified: null,
    failure: null,
  };
}

function withStep(steps: StepView[], index: number, update: (step: StepView) => StepView): StepView[] {
  const existing = steps.find((step) => step.index === index);
  const base: StepView = existing ?? { index, lines: [], narration: null, decision: null, result: null, latencyMs: null, warnings: [] };
  const next = update(base);
  return existing ? steps.map((step) => (step.index === index ? next : step)) : [...steps, next].sort((a, b) => a.index - b.index);
}

export function reduce(state: LiveState, event: StreamEvent): LiveState {
  switch (event.event) {
    case 'run.started':
      return { ...state, status: 'RUNNING', url: event.data.url, goal: event.data.goal, stepBudget: event.data.stepBudget };
    case 'step.perception':
      // A re-perceived step (F-17) replaces what was heard for that step.
      return { ...state, steps: withStep(state.steps, event.data.index, (step) => ({ ...step, lines: event.data.lines })) };
    case 'step.narration':
      return { ...state, steps: withStep(state.steps, event.data.index, (step) => ({ ...step, narration: event.data.text })) };
    case 'step.decision': {
      const { index, ...decision } = event.data;
      return { ...state, steps: withStep(state.steps, index, (step) => ({ ...step, decision })) };
    }
    case 'step.action':
      return {
        ...state,
        steps: withStep(state.steps, event.data.index, (step) => ({ ...step, result: event.data.result, latencyMs: event.data.latencyMs })),
      };
    case 'step.warning':
      return {
        ...state,
        steps: withStep(state.steps, event.data.index, (step) => ({ ...step, warnings: [...step.warnings, event.data.text] })),
      };
    case 'run.blocked':
      return { ...state, blocked: event.data };
    case 'run.succeeded':
      return { ...state, succeeded: event.data };
    case 'run.errored':
      return { ...state, errored: event.data };
    case 'run.correlated':
      return { ...state, correlated: event.data };
    case 'run.finished':
      return { ...state, status: event.data.status, finished: event.data };
    case 'fix.stage': {
      const fix = state.fix ?? emptyFix();
      // A retried stage after a failed attempt starts clean.
      return {
        ...state,
        fix: { ...fix, failure: null, stages: { ...fix.stages, [event.data.stage]: { status: event.data.status, detail: event.data.detail ?? null } } },
      };
    }
    case 'fix.located':
      return { ...state, fix: { ...(state.fix ?? emptyFix()), located: event.data } };
    case 'fix.generated':
      return {
        ...state,
        fix: { ...(state.fix ?? emptyFix()), diff: event.data.diff, rationale: event.data.rationale, linesChanged: event.data.linesChanged },
      };
    case 'fix.validated':
      return { ...state, fix: { ...(state.fix ?? emptyFix()), gates: event.data.gates, passed: event.data.passed, attempts: event.data.attempts } };
    case 'fix.pr':
      return { ...state, fix: { ...(state.fix ?? emptyFix()), pullRequest: event.data } };
    case 'fix.verifying': {
      const fix = state.fix ?? emptyFix();
      return { ...state, fix: { ...fix, verifyRunId: event.data.verifyRunId, stages: { ...fix.stages, verify: { status: 'running', detail: null } } } };
    }
    case 'fix.verified': {
      const fix = state.fix ?? emptyFix();
      return {
        ...state,
        fix: { ...fix, verified: event.data, stages: { ...fix.stages, verify: { status: event.data.success ? 'done' : 'failed', detail: null } } },
      };
    }
    case 'fix.failed': {
      const fix = state.fix ?? emptyFix();
      const stages = event.data.stage === 'verify' ? { ...fix.stages, verify: { status: 'failed' as const, detail: event.data.reason } } : fix.stages;
      return { ...state, fix: { ...fix, stages, failure: event.data } };
    }
    default:
      return state;
  }
}

export const STREAM_EVENT_NAMES: StreamEvent['event'][] = [
  'run.started',
  'step.perception',
  'step.narration',
  'step.decision',
  'step.action',
  'step.warning',
  'run.blocked',
  'run.succeeded',
  'run.correlated',
  'run.errored',
  'run.finished',
  'fix.stage',
  'fix.located',
  'fix.generated',
  'fix.validated',
  'fix.pr',
  'fix.verifying',
  'fix.verified',
  'fix.failed',
];
