/**
 * Executes one run end to end, in-process (DECISIONS.md #13):
 *
 *   open browser → frames start → axe at load → the agent loop → inspect the
 *   blocking element → axe at the stopping point → correlate → close.
 *
 * This is the privileged side. The agent loop receives only an AgentDriver and
 * an LlmProvider; the frames, axe and DOM inspection happen here, around it,
 * and none of their output reaches a prompt.
 */

import type { BlockerCategory, BlockerInfo, StepInfo } from '@ally/shared';
import { runGoal } from '../agent/loop.js';
import { inspectBlocker, markOverlaps, runAxe } from '../baseline/axe.js';
import { correlate } from '../baseline/correlate.js';
import type { Config } from '../config/index.js';
import { bindAgentDriver, closeSession, openSession } from '../driver/session.js';
import { currentUrl } from '../driver/index.js';
import type { DriverSession } from '../driver/types.js';
import { NOTHING_ANNOUNCED_LINE } from '../driver/serialize.js';
import type { LlmProvider } from '../llm/provider.js';
import { captureFrame, startFrameLoop } from '../preview/frames.js';
import { isTerminal, type RunRecord, type RunStore } from './store.js';

export interface RunnerDeps {
  store: RunStore;
  config: Config;
  createLlm: () => LlmProvider;
  /** Called when a VERIFY run finishes, so the fix flow can report on its parent. */
  onVerifyFinished?: (verifyRun: RunRecord) => void;
}

function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}

/** Categories where a result shown on screen but never announced can be the wall (F-84). */
const SILENT_RESULT_CATEGORIES = new Set<BlockerCategory>(['STATE_NOT_ANNOUNCED', 'AMBIGUOUS_CONTROLS', 'UNKNOWN']);

/** The agent pressed Enter or Space, and all it heard next was "nothing new was announced" (F-84). */
export function silentActivation(steps: StepInfo[]): boolean {
  const heardAt = new Map<number, string[]>();
  for (const step of steps) {
    if (step.transcript) heardAt.set(step.index, step.transcript.map((line) => line.spoken));
  }
  return steps.some((step) => {
    if (step.toolName !== 'press_key' || typeof step.toolInput !== 'object' || step.toolInput === null) return false;
    const key = 'key' in step.toolInput ? step.toolInput.key : null;
    if (key !== 'Enter' && key !== 'Space') return false;
    const next = heardAt.get(step.index + 1);
    return next?.length === 1 && next[0] === NOTHING_ANNOUNCED_LINE;
  });
}

function setFrame(record: RunRecord, jpeg: Buffer): void {
  record.frame = { jpeg, seq: (record.frame?.seq ?? 0) + 1 };
}

function finish(record: RunRecord, deps: RunnerDeps): void {
  record.finishedAt = new Date();
  const durationMs = record.startedAt ? record.finishedAt.getTime() - record.startedAt.getTime() : 0;
  deps.store.emit(record, {
    event: 'run.finished',
    data: { status: record.status, stepsUsed: record.stepsUsed, durationMs, reportUrl: `/run/${record.id}` },
  });
  if (record.parentRunId) deps.onVerifyFinished?.(record);
}

export async function executeRun(record: RunRecord, deps: RunnerDeps): Promise<void> {
  const { store, config } = deps;
  record.status = 'RUNNING';
  record.startedAt = new Date();
  store.emit(record, {
    event: 'run.started',
    data: { runId: record.id, url: record.url, goal: record.goal, stepBudget: record.stepBudget },
  });

  let session: DriverSession;
  try {
    session = await openSession(record.url, { headless: config.PLAYWRIGHT_HEADLESS });
  } catch (error) {
    record.status = 'ERRORED';
    record.errorMessage = `The browser could not open ${record.url}: ${error instanceof Error ? error.message : String(error)}`;
    store.emit(record, { event: 'run.errored', data: { message: record.errorMessage, code: 'NAVIGATION_FAILED' } });
    finish(record, deps);
    return;
  }

  const stopFrames = startFrameLoop(session, (jpeg) => setFrame(record, jpeg));
  try {
    const load = await runAxe(session, 'load');
    const loadPath = pathOf(currentUrl(session));

    const result = await runGoal({
      goal: record.goal,
      stepBudget: record.stepBudget,
      driver: bindAgentDriver(session),
      llm: deps.createLlm(),
      maxTranscriptLines: config.ALLY_TRANSCRIPT_MAX_LINES,
      runTimeoutMs: config.ALLY_RUN_TIMEOUT_MS,
      narration: config.ALLY_NARRATION,
      onEvent: (event) => {
        if ('index' in event.data && typeof event.data.index === 'number') {
          record.stepsUsed = Math.max(record.stepsUsed, event.data.index);
        }
        store.emit(record, event);
      },
    });

    const { outcome } = result;
    record.steps = result.steps;
    record.stepsUsed = result.stepsUsed;
    record.costUsd = result.costUsd;
    for (const usage of Object.values(result.usageByModel)) {
      record.inputTokens += usage.inputTokens + usage.cacheReadInputTokens + usage.cacheCreationInputTokens;
      record.outputTokens += usage.outputTokens;
    }
    record.status = outcome.status;
    // Which models actually served, with token counts: the way to tune a fallback list (F-79).
    console.info(`[run ${record.id.slice(0, 8)}] ${outcome.status} in ${result.stepsUsed} steps, ${Math.round(result.durationMs / 1000)} s; models: ${Object.entries(result.usageByModel).map(([model, usage]) => `${model} in ${usage.inputTokens} out ${usage.outputTokens}`).join("; ") || "none"}`);

    if (outcome.status === 'ERRORED') {
      record.errorMessage = outcome.message;
      return;
    }

    let blockerCategory: BlockerInfo['category'] | null = null;
    if (outcome.status === 'BLOCKED') {
      const { blocker } = outcome;
      blockerCategory = blocker.category;
      const facts = await inspectBlocker(session, blocker.backendNodeId, {
        preferOverlay: blocker.category === 'FOCUS_NOT_TRAPPED',
        unreachable: blocker.category === 'CONTENT_NOT_REACHABLE' || blocker.category === 'NO_KEYBOARD_PATH',
        silentActivation: SILENT_RESULT_CATEGORIES.has(blocker.category) && silentActivation(result.steps),
      });
      record.blocker = {
        atStep: blocker.atStep,
        category: blocker.category,
        summary: blocker.summary,
        agentReasoning: blocker.agentReasoning,
        axNodeId: blocker.axNodeId,
        backendNodeId: blocker.backendNodeId,
        domPath: facts?.domPath ?? null,
        role: blocker.role,
        accessibleName: blocker.accessibleName,
        htmlSnippet: facts?.htmlSnippet ?? null,
        wcagCriteria: blocker.wcagCriteria,
      };
      record.fixTarget = facts?.fixTarget ?? null;
    }

    const abandon = await runAxe(session, 'abandon');
    if (record.fixTarget) {
      if (abandon) await markOverlaps(session, abandon);
      // Load-phase selectors only mean something while we are still on that page.
      if (load && pathOf(currentUrl(session)) === loadPath) await markOverlaps(session, load);
    }

    const correlation = correlate({
      status: record.status,
      goal: record.goal,
      stepsUsed: record.stepsUsed,
      stepBudget: record.stepBudget,
      category: blockerCategory,
      load,
      abandon,
    });
    if (correlation) {
      record.axeFindings = correlation.findings;
      record.axeViolationCount = correlation.axeViolationCount;
      record.blockerCaughtByAxe = correlation.blockerCaughtByAxe;
      record.verdict = correlation.verdict;
      store.emit(record, {
        event: 'run.correlated',
        data: {
          axeViolationCount: correlation.axeViolationCount,
          blockerCaughtByAxe: correlation.blockerCaughtByAxe,
          verdict: correlation.verdict,
        },
      });
    }
  } catch (error) {
    record.status = 'ERRORED';
    record.errorMessage = error instanceof Error ? error.message : String(error);
    store.emit(record, { event: 'run.errored', data: { message: record.errorMessage, code: 'RUNNER_ERROR' } });
  } finally {
    await stopFrames();
    const last = await captureFrame(session);
    if (last) setFrame(record, last);
    await closeSession(session).catch(() => {});
    if (!isTerminal(record.status)) record.status = 'ERRORED';
    finish(record, deps);
  }
}

/** A tiny in-memory queue: at most N browsers at once. */
export class RunQueue {
  private active = 0;
  private readonly waiting: RunRecord[] = [];

  constructor(private readonly deps: RunnerDeps) {}

  get depth(): number {
    return this.waiting.length;
  }

  get free(): number {
    return Math.max(0, this.deps.config.ALLY_MAX_CONCURRENT_RUNS - this.active);
  }

  enqueue(record: RunRecord): void {
    this.waiting.push(record);
    this.pump();
  }

  private pump(): void {
    while (this.active < this.deps.config.ALLY_MAX_CONCURRENT_RUNS && this.waiting.length > 0) {
      const record = this.waiting.shift();
      if (!record) break;
      this.active++;
      executeRun(record, this.deps)
        .catch(() => {})
        .finally(() => {
          this.active--;
          this.pump();
        });
    }
  }
}
