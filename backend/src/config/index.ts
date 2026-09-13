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
  ALLY_MODEL_DECIDE: z.string().min(1).default('claude-sonnet-5'),
  ALLY_MODEL_NARRATE: z.string().min(1).default('claude-haiku-4-5-20251001'),
  ALLY_DECIDE_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('low'),
  ALLY_STEP_BUDGET: z.coerce.number().int().min(1).max(50).default(20),
  ALLY_STEP_TIMEOUT_MS: z.coerce.number().int().min(1000).default(20_000),
  ALLY_RUN_TIMEOUT_MS: z.coerce.number().int().min(10_000).default(300_000),
  ALLY_TRANSCRIPT_MAX_LINES: z.coerce.number().int().min(20).default(400),
  PLAYWRIGHT_HEADLESS: booleanFlag.default('true'),
  FIXTURE_URL: z.string().url().default('http://localhost:3100'),
});

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
