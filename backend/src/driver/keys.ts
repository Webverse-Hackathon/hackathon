import { ALLOWED_KEYS, TYPE_TEXT_MAX_LENGTH, type AllowedKey } from '@ally/shared';

const allowed = new Set<string>(ALLOWED_KEYS);

/** Rejects anything outside the allow-list before it can reach Playwright. P-5. */
export function assertAllowedKey(key: unknown): asserts key is AllowedKey {
  if (typeof key !== 'string' || !allowed.has(key)) {
    throw new Error(`Key ${JSON.stringify(key)} is not in the allow-list.`);
  }
}

/** Rejects non-strings and anything over the length limit. P-5. */
export function assertTypeableText(text: unknown): asserts text is string {
  if (typeof text !== 'string') throw new Error('typeText requires a string.');
  if (text.length > TYPE_TEXT_MAX_LENGTH) {
    throw new Error(`typeText accepts at most ${TYPE_TEXT_MAX_LENGTH} characters, got ${text.length}.`);
  }
}

/** Playwright's name for each allowed key. */
export function playwrightKey(key: AllowedKey): string {
  return key;
}
