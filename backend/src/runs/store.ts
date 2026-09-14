/**
 * Runs in memory, for the demo build (DECISIONS.md #13). Each run keeps an
 * append-only event log so an SSE client that reconnects with Last-Event-ID
 * gets exactly what it missed, and a late client gets the whole run.
 *
 * Nothing here is visible to agent/. The latest preview frame lives on the
 * record only so the API can serve it to the dashboard.
 */

import { randomUUID } from 'node:crypto';
import type {
  AxeFindingInfo,
  BlockerInfo,
  PatchInfo,
  PullRequestInfo,
  RunMode,
  RunReport,
  RunSource,
  RunStatus,
  RunSummary,
  StepInfo,
  StreamEvent,
} from '@ally/shared';

export interface LoggedEvent {
  id: number;
  event: StreamEvent;
}

export interface FixState {
  status: 'running' | 'done' | 'failed';
}

export interface RunRecord {
  id: string;
  url: string;
  goal: string;
  mode: RunMode;
  source: RunSource | 'VERIFY';
  stepBudget: number;
  status: RunStatus;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  stepsUsed: number;
  steps: StepInfo[];
  blocker: BlockerInfo | null;
  /** Raw page context for the fixer: the element to change, as HTML. Never sent to the agent. */
  fixTarget: FixTarget | null;
  axeFindings: AxeFindingInfo[];
  axeViolationCount: number | null;
  blockerCaughtByAxe: boolean | null;
  verdict: string | null;
  patch: PatchInfo | null;
  pullRequest: PullRequestInfo | null;
  fix: FixState | null;
  /** The run this one verifies, and the run that verified this one. */
  parentRunId: string | null;
  verifyRunId: string | null;
  /**
   * The site's files as this run saw them, beyond the connected source: every patch
   * applied by earlier fixes in this lineage. Relative path → full content.
   */
  overrides: Record<string, string>;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  errorMessage: string | null;
  events: LoggedEvent[];
  listeners: Set<(logged: LoggedEvent) => void>;
  frame: { jpeg: Buffer; seq: number } | null;
}

/** The element the fixer should change: the blocker node, or its nearest interactive-looking ancestor. */
export interface FixTarget {
  tagName: string;
  className: string | null;
  outerHtml: string;
  domPath: string;
  textContent: string;
}

export interface CreateRunInput {
  url: string;
  goal: string;
  mode: RunMode;
  source: RunSource | 'VERIFY';
  stepBudget: number;
  parentRunId?: string;
  overrides?: Record<string, string>;
}

const TERMINAL: ReadonlySet<RunStatus> = new Set(['SUCCEEDED', 'BLOCKED', 'ABANDONED', 'ERRORED']);

export function isTerminal(status: RunStatus): boolean {
  return TERMINAL.has(status);
}

export class RunStore {
  private readonly runs = new Map<string, RunRecord>();

  create(input: CreateRunInput): RunRecord {
    const record: RunRecord = {
      id: randomUUID(),
      url: input.url,
      goal: input.goal,
      mode: input.mode,
      source: input.source,
      stepBudget: input.stepBudget,
      status: 'QUEUED',
      createdAt: new Date(),
      startedAt: null,
      finishedAt: null,
      stepsUsed: 0,
      steps: [],
      blocker: null,
      fixTarget: null,
      axeFindings: [],
      axeViolationCount: null,
      blockerCaughtByAxe: null,
      verdict: null,
      patch: null,
      pullRequest: null,
      fix: null,
      parentRunId: input.parentRunId ?? null,
      verifyRunId: null,
      overrides: input.overrides ?? {},
      inputTokens: 0,
      outputTokens: 0,
      costUsd: null,
      errorMessage: null,
      events: [],
      listeners: new Set(),
      frame: null,
    };
    this.runs.set(record.id, record);
    return record;
  }

  get(id: string): RunRecord | undefined {
    return this.runs.get(id);
  }

  list(): RunRecord[] {
    return [...this.runs.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  emit(record: RunRecord, event: StreamEvent): void {
    const logged: LoggedEvent = { id: record.events.length + 1, event };
    record.events.push(logged);
    for (const listener of record.listeners) {
      try {
        listener(logged);
      } catch {
        // A broken client must never break the run.
      }
    }
  }

  subscribe(record: RunRecord, afterId: number, listener: (logged: LoggedEvent) => void): () => void {
    for (const logged of record.events) if (logged.id > afterId) listener(logged);
    record.listeners.add(listener);
    return () => record.listeners.delete(listener);
  }
}

export function toSummary(record: RunRecord): RunSummary {
  const durationMs =
    record.startedAt && record.finishedAt ? record.finishedAt.getTime() - record.startedAt.getTime() : null;
  return {
    id: record.id,
    url: record.url,
    goal: record.goal,
    status: record.status,
    mode: record.mode,
    stepsUsed: record.stepsUsed,
    stepBudget: record.stepBudget,
    durationMs,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toReport(record: RunRecord, store: RunStore, fixable: boolean): RunReport {
  const verify = record.verifyRunId ? store.get(record.verifyRunId) : undefined;
  return {
    ...toSummary(record),
    source: record.source,
    parentRunId: record.parentRunId,
    errorMessage: record.errorMessage,
    fixable,
    blockerCaughtByAxe: record.blockerCaughtByAxe,
    axeViolationCount: record.axeViolationCount,
    verdict: record.verdict,
    blocker: record.blocker,
    axeFindings: record.axeFindings,
    steps: record.steps,
    patch: record.patch,
    pullRequest: record.pullRequest,
    verifyRun: verify ? toSummary(verify) : null,
    cost: {
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      usd: (record.costUsd ?? 0).toFixed(6),
    },
  };
}
