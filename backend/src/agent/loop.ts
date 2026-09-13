/**
 * The agent loop: perceive → narrate → detect a loop → decide → act.
 * docs/06-AGENT-LOOP.md. Deliberately small; a framework here would hide the
 * exact thing we are demonstrating.
 *
 * The loop receives an AgentDriver (five operations bound to an open session)
 * and an LlmProvider. It never sees Playwright, pixels or coordinates.
 */

import type { BlockerCategory, StepInfo, StreamEvent, TranscriptLine } from '@ally/shared';
import { hashSnapshot } from '../driver/hash.js';
import { describeNode, serialize, spokenRole } from '../driver/serialize.js';
import { focusedNode, nameOf, roleOf } from '../driver/tree.js';
import type { AgentDriver, AXNode, AXSnapshot, FocusInfo } from '../driver/types.js';
import { costUsd } from '../llm/cost.js';
import { LlmError, addUsage, emptyUsage, type LlmProvider, type ModelUsage } from '../llm/provider.js';
import { CATEGORY_WCAG, IMMEDIATE_BLOCK_CATEGORIES, MIN_STEPS_BEFORE_BLOCKED } from './categories.js';
import { confirmSuccess } from './confirm.js';
import { LoopDetector } from './loop-detect.js';
import { narrateStep } from './narrate.js';
import { buildDecisionRequest, type HistoryTurn } from './prompts.js';
import { parseToolCall, type ParsedDecision } from './tools.js';

/** F-04: fewer meaningful lines than this on the first snapshot is itself the finding. */
const MIN_MEANINGFUL_LINES = 5;
/** Consecutive unusable decisions before the run is abandoned as our fault. */
const MAX_INVALID_DECISIONS = 3;
/** F-17: how many times one step may be re-perceived because focus moved before typing. */
const MAX_REPERCEIVE = 2;

export interface RunGoalOptions {
  goal: string;
  stepBudget: number;
  driver: AgentDriver;
  llm: LlmProvider;
  maxTranscriptLines?: number;
  runTimeoutMs?: number;
  onEvent?: (event: StreamEvent) => void;
}

export interface AgentBlocker {
  atStep: number;
  category: BlockerCategory;
  summary: string;
  agentReasoning: string;
  axNodeId: string | null;
  backendNodeId: number | null;
  role: string | null;
  accessibleName: string | null;
  wcagCriteria: string[];
}

export type RunOutcome =
  | { status: 'SUCCEEDED'; evidence: string }
  | { status: 'BLOCKED'; blocker: AgentBlocker }
  | { status: 'ABANDONED' }
  | { status: 'ERRORED'; code: string; message: string };

export interface RunResult {
  outcome: RunOutcome;
  stepsUsed: number;
  stepBudget: number;
  steps: StepInfo[];
  usageByModel: Record<string, ModelUsage>;
  /** Null when a model's price is unknown, so an unknown cost is never shown as zero. */
  costUsd: number | null;
  durationMs: number;
}

function focusPhrase(focus: FocusInfo | null): string {
  if (!focus || focus.role === 'RootWebArea') return 'the start of the page';
  return focus.name ? `${spokenRole(focus.role)}, ${focus.name}` : spokenRole(focus.role);
}

function focusIdentity(focus: FocusInfo | null): string | null {
  if (!focus) return null;
  return focus.backendNodeId !== null ? `b${focus.backendNodeId}` : `n${focus.axNodeId}`;
}

function nodeIdentity(node: AXNode | undefined): string | null {
  if (!node) return null;
  return node.backendDOMNodeId !== undefined ? `b${node.backendDOMNodeId}` : `n${node.nodeId}`;
}

function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function actionLabel(decision: ParsedDecision): string {
  const { tool } = decision;
  switch (tool.tool) {
    case 'press_key':
      return `press_key ${tool.input.key}`;
    case 'type_text':
      return `type_text ${JSON.stringify(tool.input.text)}`;
    case 'read_focus':
      return 'read_focus';
    case 'declare_success':
      return 'declare_success';
    case 'declare_blocked':
      return `declare_blocked ${tool.input.category}`;
  }
}

export async function runGoal(options: RunGoalOptions): Promise<RunResult> {
  const { goal, stepBudget, driver, llm } = options;
  const emit = options.onEvent ?? (() => {});
  const startedAt = Date.now();
  const runTimeoutMs = options.runTimeoutMs ?? 300_000;

  const steps: StepInfo[] = [];
  const history: HistoryTurn[] = [];
  const usageByModel: Record<string, ModelUsage> = {};
  const loopDetector = new LoopDetector();
  const startUrl = driver.currentUrl();

  let stepsUsed = 0;
  let previous: AXSnapshot | null = null;
  let previousTranscript: TranscriptLine[] = [];
  let invalidStreak = 0;
  let reperceived = 0;
  let actedLastStep = true;

  const recordUsage = (model: string | null, usage: ModelUsage) => {
    if (!model) return;
    usageByModel[model] = addUsage(usageByModel[model] ?? emptyUsage(), usage);
  };

  const finish = (outcome: RunOutcome): RunResult => {
    let total: number | null = 0;
    for (const [model, usage] of Object.entries(usageByModel)) {
      const cost = costUsd(model, usage);
      total = cost === null || total === null ? null : total + cost;
    }
    if (outcome.status === 'BLOCKED') {
      const { atStep, category, summary, wcagCriteria } = outcome.blocker;
      emit({ event: 'run.blocked', data: { atStep, category, summary, wcagCriteria } });
    } else if (outcome.status === 'SUCCEEDED') {
      emit({ event: 'run.succeeded', data: { stepsUsed, evidence: outcome.evidence } });
    } else if (outcome.status === 'ERRORED') {
      emit({ event: 'run.errored', data: { message: outcome.message, code: outcome.code } });
    }
    return { outcome, stepsUsed, stepBudget, steps, usageByModel, costUsd: total, durationMs: Date.now() - startedAt };
  };

  const blocked = (
    atStep: number,
    category: BlockerCategory,
    summary: string,
    agentReasoning: string,
    snapshot: AXSnapshot,
    axNodeId?: string,
  ): RunResult => {
    // The named node if it exists; otherwise whatever had focus (docs/06).
    const named = axNodeId ? snapshot.nodes.find((node) => node.nodeId === axNodeId) : undefined;
    const focused = focusedNode(snapshot.nodes);
    const node = named ?? (focused && roleOf(focused) !== 'RootWebArea' ? focused : undefined);
    return finish({
      status: 'BLOCKED',
      blocker: {
        atStep,
        category,
        summary,
        agentReasoning,
        axNodeId: node?.nodeId ?? null,
        backendNodeId: node?.backendDOMNodeId ?? null,
        role: node ? roleOf(node) : null,
        accessibleName: node ? nameOf(node) || null : null,
        wcagCriteria: CATEGORY_WCAG[category],
      },
    });
  };

  try {
    while (stepsUsed < stepBudget) {
      if (Date.now() - startedAt > runTimeoutMs) {
        return finish({ status: 'ERRORED', code: 'RUN_TIMEOUT', message: `The run exceeded ${runTimeoutMs} ms.` });
      }
      const step = stepsUsed + 1;

      // 1. PERCEIVE
      const snapshot = await driver.axSnapshot();
      const firstSnapshot = previous === null;
      const transcript = serialize(snapshot, previous, { maxLines: options.maxTranscriptLines });
      const stateHash = hashSnapshot(snapshot);
      previous = snapshot;
      emit({ event: 'step.perception', data: { index: step, lines: transcript, speak: true } });
      const stepInfo: StepInfo = { index: step, kind: 'PERCEPTION', transcript, axStateHash: stateHash };

      // Only the run's first snapshot is a full read. A re-perceived step 1 (F-17) is a
      // diff, and judging it here would call a working page empty.
      if (firstSnapshot && transcript.filter((line) => line.role !== 'note' && line.role !== 'RootWebArea').length < MIN_MEANINGFUL_LINES) {
        stepsUsed = step;
        stepInfo.kind = 'SYSTEM';
        steps.push(stepInfo);
        return blocked(
          step,
          'CONTENT_NOT_REACHABLE',
          'This page exposes almost nothing to assistive technology.',
          'Stopped before any decision: the first snapshot had fewer than five meaningful lines.',
          snapshot,
        );
      }

      // 2. NARRATE (best-effort; never blocks the run)
      const narration = await narrateStep(llm, goal, transcript);
      recordUsage(narration.model, narration.usage);
      stepInfo.narration = narration.text;
      emit({ event: 'step.narration', data: { index: step, text: narration.text } });

      // 3. DETECT A LOOP before spending a decision call. Only a state reached by
      // acting counts: when the previous step produced no action (an unusable
      // decision, a refused declaration), the page is unchanged through no fault
      // of the site, and blaming it would be a false finding (F-65).
      const verdict = actedLastStep
        ? loopDetector.observe(stateHash, nodeIdentity(focusedNode(snapshot.nodes)))
        : null;
      if (verdict) {
        stepsUsed = step;
        stepInfo.kind = 'SYSTEM';
        steps.push(stepInfo);
        return blocked(step, verdict.category, verdict.reason, 'Stopped by the loop detector before another decision call.', snapshot);
      }

      // 4. DECIDE
      const decisionStartedAt = Date.now();
      let parsed: ReturnType<typeof parseToolCall> = { ok: false, error: 'No decision was made.' };
      let correction: string | undefined;
      for (let attempt = 0; attempt < 2 && !parsed.ok; attempt++) {
        const response = await llm.decide(
          buildDecisionRequest({ goal, step, budget: stepBudget, history, transcript, correction }),
        );
        recordUsage(response.model, response.usage);
        parsed = parseToolCall(response.toolCalls[0]);
        if (!parsed.ok) correction = parsed.error;
      }
      stepsUsed = step;

      if (!parsed.ok) {
        invalidStreak++;
        emit({ event: 'step.warning', data: { index: step, text: `The decision could not be used: ${parsed.error}` } });
        stepInfo.kind = 'SYSTEM';
        stepInfo.actionResult = parsed.error;
        steps.push(stepInfo);
        history.push({ step, transcript, action: 'no usable action', reasoning: '', result: parsed.error });
        previousTranscript = transcript;
        actedLastStep = false;
        if (invalidStreak >= MAX_INVALID_DECISIONS) {
          return finish({ status: 'ERRORED', code: 'DECISION_INVALID', message: 'The decision model returned no usable action three times in a row.' });
        }
        continue;
      }
      invalidStreak = 0;

      const decision = parsed.decision;
      const { tool } = decision;
      stepInfo.kind = 'DECISION';
      stepInfo.toolName = tool.tool;
      stepInfo.toolInput = tool.input;
      stepInfo.reasoning = decision.reasoning;
      stepInfo.confidence = decision.confidence;
      emit({
        event: 'step.decision',
        data: { index: step, tool: tool.tool, input: tool.input, reasoning: decision.reasoning, confidence: decision.confidence },
      });

      if (tool.tool === 'declare_success') {
        steps.push(stepInfo);
        const confirmation = confirmSuccess({
          evidence: tool.input.evidence,
          recentLines: [...previousTranscript, ...transcript],
          startUrl,
          currentUrl: driver.currentUrl(),
        });
        if (confirmation.confirmed) return finish({ status: 'SUCCEEDED', evidence: confirmation.evidence });
        return blocked(step, 'UNKNOWN', confirmation.reason, decision.reasoning, snapshot);
      }

      if (tool.tool === 'declare_blocked') {
        const { category, reason, axNodeId } = tool.input;
        if (step < MIN_STEPS_BEFORE_BLOCKED && !IMMEDIATE_BLOCK_CATEGORIES.has(category)) {
          const refusal = `Declaration refused: keep exploring for at least ${MIN_STEPS_BEFORE_BLOCKED} steps before concluding (F-10).`;
          emit({ event: 'step.warning', data: { index: step, text: refusal } });
          stepInfo.actionResult = refusal;
          steps.push(stepInfo);
          history.push({ step, transcript, action: actionLabel(decision), reasoning: decision.reasoning, result: refusal });
          previousTranscript = transcript;
          actedLastStep = false;
          continue;
        }
        steps.push(stepInfo);
        return blocked(step, category, reason, decision.reasoning, snapshot, axNodeId);
      }

      // 5. ACT — keystrokes only
      let result: string;
      if (tool.tool === 'read_focus') {
        const focused = focusedNode(snapshot.nodes);
        result =
          focused && roleOf(focused) !== 'RootWebArea'
            ? `focus is on ${describeNode(focused).spoken}`
            : 'focus is at the start of the page.';
      } else if (tool.tool === 'type_text') {
        // F-17: never type blind. If focus moved since we perceived, re-perceive instead.
        const perceived = nodeIdentity(focusedNode(snapshot.nodes));
        const now = await driver.focusInfo();
        if (focusIdentity(now) !== perceived && reperceived < MAX_REPERCEIVE) {
          reperceived++;
          stepsUsed = step - 1;
          emit({ event: 'step.warning', data: { index: step, text: 'Focus moved before typing, so nothing was typed. Perceiving again.' } });
          continue;
        }
        await driver.typeText(tool.input.text);
        result = `typed ${JSON.stringify(tool.input.text)} into ${focusPhrase(await driver.focusInfo())}`;
      } else {
        const focusBefore = await driver.focusInfo();
        const urlBefore = driver.currentUrl();
        await driver.pressKey(tool.input.key);
        const focusAfter = await driver.focusInfo();
        const urlAfter = driver.currentUrl();
        if (pathOf(urlAfter) !== pathOf(urlBefore)) {
          result = `the page changed to ${pathOf(urlAfter)}`;
        } else if (focusIdentity(focusAfter) !== focusIdentity(focusBefore)) {
          result = `focus moved to ${focusPhrase(focusAfter)}`;
        } else {
          result = 'focus did not move';
          emit({ event: 'step.warning', data: { index: step, text: 'Focus did not move.' } });
        }
      }
      reperceived = 0;
      actedLastStep = true;

      const latencyMs = Date.now() - decisionStartedAt;
      emit({ event: 'step.action', data: { index: step, result, latencyMs } });
      stepInfo.kind = 'ACTION';
      stepInfo.actionResult = result;
      stepInfo.latencyMs = latencyMs;
      steps.push(stepInfo);
      history.push({ step, transcript, action: actionLabel(decision), reasoning: decision.reasoning, result });
      previousTranscript = transcript;
    }

    return finish({ status: 'ABANDONED' });
  } catch (error) {
    if (error instanceof LlmError) {
      return finish({ status: 'ERRORED', code: `LLM_${error.code}`, message: error.message });
    }
    const message = error instanceof Error ? error.message : String(error);
    return finish({ status: 'ERRORED', code: 'DRIVER_ERROR', message });
  }
}
