/**
 * Per-run cost, so a regression is visible rather than discovered on an
 * invoice (F-22). Prices are USD per million tokens, Anthropic first-party
 * rates. Cache writes bill at 1.25x input, cache reads at 0.1x input.
 */

import type { ModelUsage } from './provider.js';

interface Price {
  input: number;
  output: number;
}

const PRICES: { prefix: string; price: Price }[] = [
  { prefix: 'claude-sonnet-5', price: { input: 2, output: 10 } },
  { prefix: 'claude-haiku-4-5', price: { input: 1, output: 5 } },
  { prefix: 'claude-opus-5', price: { input: 5, output: 25 } },
];

export function priceFor(model: string): Price | null {
  return PRICES.find((entry) => model.startsWith(entry.prefix))?.price ?? null;
}

/** Null when the model is not in the table, so an unknown price is never shown as zero. */
export function costUsd(model: string, usage: ModelUsage): number | null {
  const price = priceFor(model);
  if (!price) return null;
  const perToken = (perMillion: number) => perMillion / 1_000_000;
  return (
    usage.inputTokens * perToken(price.input) +
    usage.cacheCreationInputTokens * perToken(price.input) * 1.25 +
    usage.cacheReadInputTokens * perToken(price.input) * 0.1 +
    usage.outputTokens * perToken(price.output)
  );
}

/** Decimal string with six places, matching RunReport.cost.usd. */
export function formatUsd(amount: number): string {
  return amount.toFixed(6);
}
