/**
 * Narration with the vocabulary guard (F-18). A narration that uses visual
 * language is regenerated once, then replaced by the raw transcript, so a
 * violation is never emitted. Narration is best-effort (F-20): if the model
 * call fails, the raw transcript is spoken instead and the run continues.
 */

import type { TranscriptLine } from '@ally/shared';
import { emptyUsage, type LlmProvider, type ModelUsage } from '../llm/provider.js';
import { buildNarrationRequest } from './prompts.js';

const FORBIDDEN_WORDS = [
  // perception words that assume sight
  'see', 'sees', 'seeing', 'seen', 'look', 'looks', 'looking', 'appear', 'appears', 'appeared', 'appearing',
  'screen', 'visible', 'visually', 'displayed', 'shown',
  // colour
  'colour', 'color', 'coloured', 'colored', 'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink',
  'black', 'white', 'grey', 'gray', 'brown',
  // position and layout
  'top', 'bottom', 'left', 'right', 'above', 'below', 'corner', 'centre', 'center', 'beside', 'upper', 'lower',
  'sidebar', 'column', 'layout',
  // size
  'big', 'large', 'small', 'tiny', 'huge', 'wide', 'narrow',
];

const MAX_WORDS_FALLBACK_LINES = 3;

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z]+/g) ?? []);
}

/**
 * Forbidden words in `narration`. A word is allowed when the page itself said
 * it, so reading out a product called "Blue linen shirt" is not a violation.
 */
export function narrationViolations(narration: string, transcript: TranscriptLine[]): string[] {
  const spokenByPage = words(transcript.map((line) => line.spoken).join(' '));
  const used = words(narration);
  return FORBIDDEN_WORDS.filter((word) => used.has(word) && !spokenByPage.has(word));
}

export function fallbackNarration(transcript: TranscriptLine[]): string {
  const spoken = transcript.slice(0, MAX_WORDS_FALLBACK_LINES).map((line) => line.spoken);
  const more = transcript.length > MAX_WORDS_FALLBACK_LINES ? ' …' : '';
  return `${spoken.join(' ')}${more}`.trim();
}

export interface NarrationResult {
  text: string;
  source: 'model' | 'fallback';
  usage: ModelUsage;
  model: string | null;
}

export async function narrateStep(llm: LlmProvider, goal: string, transcript: TranscriptLine[]): Promise<NarrationResult> {
  let usage = emptyUsage();
  let model: string | null = null;
  let correction: string | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await llm.narrate(buildNarrationRequest(goal, transcript, correction));
      model = response.model;
      usage = {
        inputTokens: usage.inputTokens + response.usage.inputTokens,
        outputTokens: usage.outputTokens + response.usage.outputTokens,
        cacheReadInputTokens: usage.cacheReadInputTokens + response.usage.cacheReadInputTokens,
        cacheCreationInputTokens: usage.cacheCreationInputTokens + response.usage.cacheCreationInputTokens,
      };
      const text = response.text.replace(/^["“]|["”]$/g, '').trim();
      const violations = narrationViolations(text, transcript);
      if (text !== '' && violations.length === 0) return { text, source: 'model', usage, model };
      correction = `Your last sentence used forbidden words (${violations.join(', ') || 'empty reply'}). Say it again without them.`;
    } catch {
      break;
    }
  }
  return { text: fallbackNarration(transcript), source: 'fallback', usage, model };
}
