/**
 * Run a goal from the terminal with no database and no UI. The Day 1
 * deliverable, and the fastest way to debug the loop.
 *
 *   pnpm agent --url http://localhost:3100 --goal "complete checkout"
 *   pnpm agent --url ... --goal ... --expect BLOCKED      exit 1 if the status differs
 *   pnpm agent --url ... --goal ... --budget 12 --headed
 *
 * Exit codes: 0 finished (and matched --expect), 1 status did not match
 * --expect, 2 usage or configuration error, 3 the run errored.
 */

import { parseArgs } from 'node:util';
import { RunStatusSchema, type StreamEvent } from '@ally/shared';
import { runGoal, type RunResult } from '../agent/loop.js';
import { loadConfig, loadDotEnv } from '../config/index.js';
import { bindAgentDriver, closeSession, openSession } from '../driver/session.js';
import { createLlmProvider, missingModelConfig, providerHost } from '../llm/factory.js';
import { formatUsd } from '../llm/cost.js';

const color = {
  dim: (text: string) => `\x1b[2m${text}\x1b[0m`,
  bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
};

function usage(message?: string): never {
  if (message) console.error(color.red(message));
  console.error('usage: pnpm agent --url <url> --goal "<goal>" [--budget N] [--expect STATUS] [--headed]');
  process.exit(2);
}

function printEvent(event: StreamEvent): void {
  switch (event.event) {
    case 'step.perception':
      console.log(`\n${color.bold(`── step ${event.data.index}`)}`);
      for (const line of event.data.lines) {
        const flags = [line.suspiciousName ? 'meaningless name' : '', line.possibleInjection ? 'possible injection' : '']
          .filter(Boolean)
          .join(', ');
        const id = line.axNodeId ? `[${line.axNodeId}] ` : '';
        console.log(color.dim(`   ${id}${line.spoken}`) + (flags ? color.yellow(`  ← ${flags}`) : ''));
      }
      break;
    case 'step.narration':
      console.log(color.cyan(`   agent: “${event.data.text}”`));
      break;
    case 'step.decision': {
      const input = JSON.stringify(event.data.input);
      console.log(`   → ${color.bold(event.data.tool)} ${input} ${color.dim(`(${event.data.confidence.toFixed(2)}) ${event.data.reasoning}`)}`);
      break;
    }
    case 'step.action':
      console.log(color.dim(`   ✓ ${event.data.result} · ${event.data.latencyMs} ms`));
      break;
    case 'step.warning':
      console.log(color.yellow(`   ! ${event.data.text}`));
      break;
    default:
      break;
  }
}

function printResult(result: RunResult): void {
  const { outcome } = result;
  console.log(`\n${color.bold('════ outcome')}`);
  switch (outcome.status) {
    case 'SUCCEEDED':
      console.log(color.green(`SUCCEEDED in ${result.stepsUsed} of ${result.stepBudget} steps`));
      console.log(`evidence: ${outcome.evidence}`);
      break;
    case 'BLOCKED': {
      const { blocker } = outcome;
      console.log(color.red(`BLOCKED at step ${blocker.atStep} of ${result.stepBudget}: ${blocker.category}`));
      console.log(`summary:   ${blocker.summary}`);
      console.log(`reasoning: ${blocker.agentReasoning}`);
      const node = blocker.axNodeId
        ? `[${blocker.axNodeId}] ${blocker.role ?? 'unknown role'}, name ${blocker.accessibleName === null ? 'none' : JSON.stringify(blocker.accessibleName)}, backend node ${blocker.backendNodeId ?? 'unknown'}`
        : 'none identified';
      console.log(`node:      ${node}`);
      console.log(`wcag:      ${blocker.wcagCriteria.join(', ') || 'none'}`);
      break;
    }
    case 'ABANDONED':
      console.log(color.yellow(`ABANDONED: the step budget of ${result.stepBudget} ran out without a conclusion`));
      break;
    case 'ERRORED':
      console.log(color.red(`ERRORED (${outcome.code}): ${outcome.message}`));
      break;
  }
  const tokens = Object.entries(result.usageByModel)
    .map(([model, usage]) => `${model} in ${usage.inputTokens}+${usage.cacheReadInputTokens} cached / out ${usage.outputTokens}`)
    .join('; ');
  const cost = result.costUsd === null ? 'unknown' : `$${formatUsd(result.costUsd)}`;
  console.log(color.dim(`duration ${(result.durationMs / 1000).toFixed(1)} s · cost ${cost}${tokens ? ` · ${tokens}` : ''}`));
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      url: { type: 'string' },
      goal: { type: 'string' },
      budget: { type: 'string' },
      expect: { type: 'string' },
      headed: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });

  if (!values.url) usage('--url is required.');
  if (!values.goal || values.goal.trim().length < 3) usage('--goal is required, at least three characters.');
  const expected = values.expect === undefined ? undefined : RunStatusSchema.safeParse(values.expect.toUpperCase());
  if (expected && !expected.success) usage(`--expect must be one of ${RunStatusSchema.options.join(', ')}.`);

  loadDotEnv();
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    usage(error instanceof Error ? error.message : String(error));
  }
  const missing = missingModelConfig(config);
  if (missing) usage(missing);
  const budget = values.budget === undefined ? config.ALLY_STEP_BUDGET : Number(values.budget);
  if (!Number.isInteger(budget) || budget < 1 || budget > 50) usage('--budget must be an integer from 1 to 50.');

  const llm = createLlmProvider(config);

  console.log(color.bold(`Ally · ${values.goal}`));
  console.log(color.dim(`${values.url} · budget ${budget} · decide ${config.ALLY_MODEL_DECIDE} · narrate ${config.ALLY_MODEL_NARRATE} · via ${providerHost(config)} · narration ${config.ALLY_NARRATION}`));

  const session = await openSession(values.url, { headless: values.headed ? false : config.PLAYWRIGHT_HEADLESS });
  let result: RunResult;
  try {
    result = await runGoal({
      goal: values.goal.trim(),
      stepBudget: budget,
      driver: bindAgentDriver(session),
      llm,
      maxTranscriptLines: config.ALLY_TRANSCRIPT_MAX_LINES,
      runTimeoutMs: config.ALLY_RUN_TIMEOUT_MS,
      narration: config.ALLY_NARRATION,
      onEvent: printEvent,
    });
  } finally {
    await closeSession(session);
  }

  printResult(result);
  if (result.outcome.status === 'ERRORED') process.exit(3);
  if (expected?.success && expected.data !== result.outcome.status) {
    console.error(color.red(`expected ${expected.data}, got ${result.outcome.status}`));
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(color.red(error instanceof Error ? (error.stack ?? error.message) : String(error)));
  process.exit(3);
});
