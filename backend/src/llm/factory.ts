/**
 * Builds the configured LlmProvider. The API server and the CLI both come here,
 * so choosing a provider is one setting (ALLY_LLM_PROVIDER), never a code change.
 */

import type { Config } from '../config/index.js';
import { createAnthropicProvider } from './anthropic.js';
import { createOpenAiCompatibleProvider } from './openai-compatible.js';
import type { LlmProvider } from './provider.js';

/** Null when the provider is configured; otherwise what is missing, in words. */
export function missingModelConfig(config: Config): string | null {
  if (config.ALLY_LLM_PROVIDER === 'openai-compatible') {
    return config.ALLY_OPENAI_COMPAT_API_KEY ? null : 'ALLY_OPENAI_COMPAT_API_KEY is not set. Put your OpenRouter (or other provider) key in .env.';
  }
  return config.ANTHROPIC_API_KEY ? null : 'ANTHROPIC_API_KEY is not set. Put it in the repository .env (see .env.example).';
}

export function providerHost(config: Config): string {
  const url = config.ALLY_LLM_PROVIDER === 'openai-compatible' ? config.ALLY_OPENAI_COMPAT_BASE_URL : (config.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com');
  return new URL(url).host;
}

export function createLlmProvider(config: Config): LlmProvider {
  const missing = missingModelConfig(config);
  if (missing) throw new Error(missing);

  if (config.ALLY_LLM_PROVIDER === 'openai-compatible') {
    return createOpenAiCompatibleProvider({
      apiKey: config.ALLY_OPENAI_COMPAT_API_KEY as string,
      baseURL: config.ALLY_OPENAI_COMPAT_BASE_URL,
      decideModel: config.ALLY_MODEL_DECIDE,
      narrateModel: config.ALLY_MODEL_NARRATE,
      reasoningEffort: config.ALLY_OPENAI_COMPAT_REASONING_EFFORT === 'none' ? null : config.ALLY_OPENAI_COMPAT_REASONING_EFFORT,
      timeoutMs: config.ALLY_STEP_TIMEOUT_MS,
      // Free endpoints are often briefly overloaded: retry through the fallback list with backoff.
      maxRetries: 4,
    });
  }

  return createAnthropicProvider({
    apiKey: config.ANTHROPIC_API_KEY as string,
    baseURL: config.ANTHROPIC_BASE_URL,
    decideModel: config.ALLY_MODEL_DECIDE,
    narrateModel: config.ALLY_MODEL_NARRATE,
    decideEffort: config.ALLY_DECIDE_EFFORT,
    timeoutMs: config.ALLY_STEP_TIMEOUT_MS,
    maxRetries: 3,
  });
}
