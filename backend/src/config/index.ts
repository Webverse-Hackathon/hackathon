/**
 * Environment parsing with zod. Fail fast at boot on a bad value, with a
 * message that names the variable.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const PLACEHOLDER_KEY = 'sk-ant-...';

const booleanFlag = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z
    .string()
    .optional()
    .transform((value) => (value === undefined || value.trim() === '' || value.trim() === PLACEHOLDER_KEY ? undefined : value.trim())),
  // An Anthropic-compatible gateway in place of api.anthropic.com. Empty means the official API.
  ANTHROPIC_BASE_URL: z
    .string()
    .optional()
    .transform((value) => (value === undefined || value.trim() === '' ? undefined : value.trim()))
    .pipe(z.string().url().optional()),
  /** Which adapter in llm/ to use (DECISIONS.md #15). */
  ALLY_LLM_PROVIDER: z.enum(['anthropic', 'openai-compatible']).default('anthropic'),
  ALLY_OPENAI_COMPAT_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
  ALLY_OPENAI_COMPAT_API_KEY: z
    .string()
    .optional()
    .transform((value) => (value === undefined || value.trim() === '' ? undefined : value.trim())),
  ALLY_OPENAI_COMPAT_REASONING_EFFORT: z.enum(['none', 'low', 'medium', 'high']).default('low'),
  /** 'decision' speaks the decision's reasoning instead of a second call per step. */
  ALLY_NARRATION: z.enum(['model', 'decision']).default('model'),
  ALLY_MODEL_DECIDE: z.string().min(1).default('claude-sonnet-5'),
  ALLY_MODEL_NARRATE: z.string().min(1).default('claude-haiku-4-5-20251001'),
  ALLY_DECIDE_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('low'),
  ALLY_STEP_BUDGET: z.coerce.number().int().min(1).max(50).default(20),
  ALLY_STEP_TIMEOUT_MS: z.coerce.number().int().min(1000).default(20_000),
  ALLY_RUN_TIMEOUT_MS: z.coerce.number().int().min(10_000).default(300_000),
  ALLY_TRANSCRIPT_MAX_LINES: z.coerce.number().int().min(20).default(400),
  PLAYWRIGHT_HEADLESS: booleanFlag.default('true'),
  FIXTURE_URL: z.string().url().default('http://localhost:3100'),

  // ─── The demo server (DECISIONS.md #13) ─────────────────────────────────────
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  /** The dashboard's origin, the only one CORS allows. */
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:3000'),
  ALLY_MAX_CONCURRENT_RUNS: z.coerce.number().int().min(1).max(8).default(2),
  /** F-01: private and loopback addresses are refused unless the host is listed here. */
  ALLY_PRIVATE_HOST_ALLOWLIST: z
    .string()
    .default('localhost,127.0.0.1')
    .transform((value) => value.split(',').map((host) => host.trim().toLowerCase()).filter(Boolean)),

  /** Mode A for the demo: runs against this origin can be fixed, because we hold its source. */
  ALLY_CONNECTED_SITE_URL: z.string().url().default('http://localhost:3100'),
  ALLY_CONNECTED_SOURCE_DIR: z.string().min(1).default('fixtures/broken-shop'),
  /** Where a patch is applied and served for the verify re-run. */
  ALLY_VERIFY_SOURCE_DIR: z.string().min(1).default('fixtures/fixed-shop'),
  ALLY_VERIFY_SITE_URL: z.string().url().default('http://localhost:3101'),

  /** Optional. With both set, the fix flow opens a real pull request. */
  GITHUB_TOKEN: z
    .string()
    .optional()
    .transform((value) => (value === undefined || value.trim() === '' ? undefined : value.trim())),
  GITHUB_REPO: z
    .string()
    .optional()
    .transform((value) => (value === undefined || value.trim() === '' ? undefined : value.trim()))
    .pipe(z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'GITHUB_REPO must look like owner/name').optional()),
  /** Path of the connected site's source inside GITHUB_REPO, e.g. "fixtures/broken-shop". */
  GITHUB_SOURCE_PATH: z.string().default('fixtures/broken-shop'),
  GITHUB_BASE_BRANCH: z.string().min(1).default('main'),
});

/** The repository root: the directory holding pnpm-workspace.yaml. */
export function repoRoot(): string {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth++) {
    if (existsSync(path.join(directory, 'pnpm-workspace.yaml'))) return directory;
    directory = path.dirname(directory);
  }
  throw new Error('Could not find the repository root (pnpm-workspace.yaml).');
}

export type Config = z.infer<typeof EnvSchema>;

/** Loads the repository's .env if present. Existing environment variables win. */
export function loadDotEnv(): void {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 6; depth++) {
    const candidate = path.join(directory, '.env');
    if (existsSync(candidate) && existsSync(path.join(directory, 'pnpm-workspace.yaml'))) {
      process.loadEnvFile(candidate);
      return;
    }
    directory = path.dirname(directory);
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return parsed.data;
}
