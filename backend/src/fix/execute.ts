/**
 * The fix flow for a BLOCKED run (docs/07, simplified for the demo, DECISIONS.md #13):
 *
 *   locate (AST search) → read → generate (decision model) → validate (five gates,
 *   up to three attempts) → pull request (if GitHub is configured) → verify re-run
 *   against the patched copy of the site.
 *
 * Every stage is reported on the run's own stream as fix.* events.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { LOCATE_CONFIDENCE_THRESHOLD, STEP_BUDGET_DEFAULT, type FixStage, type StreamEvent } from '@ally/shared';
import { repoRoot, type Config } from '../config/index.js';
import { commentOnPullRequest, openPullRequest } from '../github/pull-request.js';
import { costUsd } from '../llm/cost.js';
import type { LlmProvider, ModelUsage } from '../llm/provider.js';
import { applyReplacement, buildPatchRequest, proposePatch, type AppliedPatch, type PatchProposal } from '../patch/generate.js';
import { validatePatch, type GateReport } from '../patch/validate.js';
import type { RunQueue } from '../runs/execute.js';
import type { RunRecord, RunStore } from '../runs/store.js';
import { locateElement, readSource } from '../sourcemap/ast-search.js';
import { syncVerifySite, waitForSite } from './workspace.js';

export const MAX_PATCH_ATTEMPTS = 3;

export interface FixDeps {
  store: RunStore;
  config: Config;
  queue: RunQueue;
  createLlm: () => LlmProvider;
}

export function resolveDir(dir: string): string {
  return path.isAbsolute(dir) ? dir : path.join(repoRoot(), dir);
}

/** Why a run cannot be fixed, or null when it can. */
export function fixRefusal(record: RunRecord): string | null {
  if (record.status !== 'BLOCKED') return 'Only a blocked run can be fixed.';
  if (record.mode !== 'REPO_CONNECTED') return 'No source repository is connected to this site, so there is nothing to patch.';
  if (!record.fixTarget || !record.blocker) return 'The blocker has no element on the page to map back to source.';
  if (record.fix && record.fix.status !== 'failed') return 'A fix for this run is already in progress or done.';
  return null;
}

function addCost(record: RunRecord, model: string, usage: ModelUsage): void {
  record.inputTokens += usage.inputTokens + usage.cacheReadInputTokens + usage.cacheCreationInputTokens;
  record.outputTokens += usage.outputTokens;
  const cost = costUsd(model, usage);
  record.costUsd = cost === null || record.costUsd === null ? record.costUsd : record.costUsd + cost;
}

export async function executeFix(record: RunRecord, deps: FixDeps): Promise<void> {
  const { store, config } = deps;
  const emit = (event: StreamEvent) => store.emit(record, event);
  const stage = (name: FixStage, status: 'running' | 'done' | 'failed' | 'skipped', detail?: string) =>
    emit({ event: 'fix.stage', data: detail ? { stage: name, status, detail } : { stage: name, status } });
  const fail = (name: FixStage | 'verify', reason: string, suggestedDiff: string | null = null) => {
    if (name !== 'verify') stage(name, 'failed', reason);
    emit({ event: 'fix.failed', data: { stage: name, reason, suggestedDiff } });
    record.fix = { status: 'failed' };
  };

  record.fix = { status: 'running' };
  const sourceDir = resolveDir(config.ALLY_CONNECTED_SOURCE_DIR);
  const verifyDir = resolveDir(config.ALLY_VERIFY_SOURCE_DIR);
  const { blocker, fixTarget } = record;
  if (!blocker || !fixTarget) return fail('locate', 'The blocker has no element on the page to map back to source.');

  try {
    // 1. LOCATE
    stage('locate', 'running');
    const located = locateElement(sourceDir, fixTarget, record.overrides);
    if (!located) {
      return fail('locate', `No JSX element in the source renders <${fixTarget.tagName}${fixTarget.className ? ` class="${fixTarget.className}"` : ''}>.`);
    }
    const source = {
      filePath: located.filePath,
      lineStart: located.lineStart,
      lineEnd: located.lineEnd,
      locateMethod: 'ast-search' as const,
      locateConfidence: located.confidence,
    };
    blocker.source = source;
    emit({ event: 'fix.located', data: source });
    if (located.confidence < LOCATE_CONFIDENCE_THRESHOLD) {
      return fail('locate', `${located.candidates} elements in the source could have rendered this, so we will not guess which one to patch.`);
    }
    stage('locate', 'done');

    // 2. READ
    stage('read', 'running');
    const fileText = readSource(sourceDir, located.filePath, record.overrides);
    stage('read', 'done');

    // 3–4. GENERATE and VALIDATE, feeding gate failures back to the model
    const llm = deps.createLlm();
    let correction: string | undefined;
    let accepted: { proposal: PatchProposal; applied: AppliedPatch; report: GateReport; attempt: number } | null = null;
    let lastDiff: string | null = null;
    let lastProblems: string[] = [];

    for (let attempt = 1; attempt <= MAX_PATCH_ATTEMPTS && !accepted; attempt++) {
      stage('generate', 'running');
      const proposal = await proposePatch(llm, buildPatchRequest({ fileText, located, blocker, target: fixTarget, goal: record.goal, correction }));
      addCost(record, proposal.model, proposal.usage);
      if ('error' in proposal) {
        correction = proposal.error;
        lastProblems = [proposal.error];
        continue;
      }
      const applied = applyReplacement(fileText, located.filePath, located, proposal.replacement);
      lastDiff = applied.diff;
      emit({ event: 'fix.generated', data: { diff: applied.diff, linesChanged: applied.linesChanged, rationale: proposal.rationale } });
      stage('generate', 'done');

      stage('validate', 'running');
      // Start from the code as tested, so a failed attempt never leaks into the next.
      syncVerifySite(sourceDir, verifyDir, record.overrides);
      const report = await validatePatch({
        filePath: located.filePath,
        originalText: readSource(sourceDir, located.filePath, record.overrides),
        expectedOriginal: fileText,
        patchedText: applied.content,
        newLineStart: applied.newLineStart,
        newLineEnd: applied.newLineEnd,
        linesChanged: applied.linesChanged,
        projectDir: verifyDir,
      });
      emit({ event: 'fix.validated', data: { passed: report.passed, gates: report.gates, attempts: attempt } });
      record.patch = {
        filePath: located.filePath,
        lineStart: located.lineStart,
        lineEnd: located.lineEnd,
        diff: applied.diff,
        rationale: proposal.rationale,
        linesChanged: applied.linesChanged,
        validated: report.passed,
        gateResults: report.gates,
        attempts: attempt,
      };
      if (report.passed) accepted = { proposal, applied, report, attempt };
      else {
        lastProblems = report.problems;
        correction = report.problems.join('\n');
      }
    }

    if (!accepted) {
      syncVerifySite(sourceDir, verifyDir, record.overrides);
      return fail('validate', `${MAX_PATCH_ATTEMPTS} attempts did not pass the gates. ${lastProblems.join(' ')}`.trim(), lastDiff);
    }
    stage('validate', 'done');

    const overrides = { ...record.overrides, [located.filePath]: accepted.applied.content };

    // 5. PULL REQUEST
    if (config.GITHUB_TOKEN && config.GITHUB_REPO) {
      stage('pr', 'running');
      try {
        const originals = Object.fromEntries(
          Object.keys(overrides).map((file) => [file, readFileSync(path.join(sourceDir, file), 'utf8')]),
        );
        record.pullRequest = await openPullRequest({
          token: config.GITHUB_TOKEN,
          repo: config.GITHUB_REPO,
          baseBranch: config.GITHUB_BASE_BRANCH,
          sourcePath: config.GITHUB_SOURCE_PATH,
          runId: record.id,
          goal: record.goal,
          url: record.url,
          blocker,
          files: overrides,
          originals,
          diff: accepted.applied.diff,
          rationale: accepted.proposal.rationale,
          stepsUsed: record.stepsUsed,
          stepBudget: record.stepBudget,
        });
        emit({ event: 'fix.pr', data: record.pullRequest });
        stage('pr', 'done');
      } catch (error) {
        stage('pr', 'failed', `The pull request could not be opened: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      stage('pr', 'skipped', 'No GitHub repository is configured, so the validated diff is shown here instead of a pull request.');
    }

    // 6. VERIFY — the same goal, against the patched site
    syncVerifySite(sourceDir, verifyDir, overrides);
    if (!(await waitForSite(config.ALLY_VERIFY_SITE_URL))) {
      return fail('verify', `The patched site at ${config.ALLY_VERIFY_SITE_URL} is not running, so the fix could not be re-run.`);
    }
    const original = new URL(record.url);
    const verifyUrl = new URL(original.pathname + original.search, config.ALLY_VERIFY_SITE_URL).toString();
    const verify = store.create({
      url: verifyUrl,
      goal: record.goal,
      mode: 'REPO_CONNECTED',
      source: 'VERIFY',
      // The verify run walks past the old wall to the goal, so it gets at least the default budget (F-83).
      stepBudget: Math.max(record.stepBudget, STEP_BUDGET_DEFAULT),
      parentRunId: record.id,
      overrides,
    });
    record.verifyRunId = verify.id;
    emit({ event: 'fix.verifying', data: { verifyRunId: verify.id, liveUrl: `/live/${verify.id}` } });
    record.fix = { status: 'done' };
    deps.queue.enqueue(verify);
  } catch (error) {
    fail('verify', `The fix flow failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Reports a finished verify run on the run it verifies, and on its pull request. */
export function reportVerification(verify: RunRecord, deps: Pick<FixDeps, 'store' | 'config'>): void {
  const parent = verify.parentRunId ? deps.store.get(verify.parentRunId) : undefined;
  if (!parent) return;
  const success = verify.status === 'SUCCEEDED';
  deps.store.emit(parent, {
    event: 'fix.verified',
    data: { success, stepsUsed: verify.stepsUsed, before: parent.stepsUsed, after: verify.stepsUsed },
  });
  const pr = parent.pullRequest;
  if (pr && deps.config.GITHUB_TOKEN) {
    pr.verified = success;
    const body = success
      ? `✅ **Verified.** Ally re-ran "${parent.goal}" against the patched site and completed it in ${verify.stepsUsed} steps (it was stopped at step ${parent.stepsUsed} before).`
      : `⚠️ **Not verified yet.** The re-run ended ${verify.status}${verify.blocker ? ` at step ${verify.blocker.atStep}: ${verify.blocker.summary}` : ''}. This patch removes one wall; the re-run found the next.`;
    commentOnPullRequest(deps.config.GITHUB_TOKEN, pr, body).catch(() => {});
  }
}
