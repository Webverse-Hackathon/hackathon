import type { BlockerCategory } from '@ally/shared';

/** What each category means, in the words the decision prompt uses. */
export const CATEGORY_GUIDE: Record<BlockerCategory, string> = {
  UNLABELLED_CONTROL: 'a control you need has no accessible name, or the control you need is not exposed as a control at all',
  FOCUS_NOT_TRAPPED: 'a dialog or overlay opened but focus stayed outside it, so you cannot reach what is inside',
  FOCUS_ORDER_BROKEN: 'focus jumps in an order that makes the task impossible to follow',
  KEYBOARD_TRAP: 'focus cannot leave a control with Tab, Shift+Tab or Escape',
  NO_KEYBOARD_PATH: 'full Tab cycles through the page never reach anything that could progress the goal',
  MEANINGLESS_NAME: 'names exist but are filenames, hashes or URLs, so they convey nothing',
  STATE_NOT_ANNOUNCED: 'something changed but nothing was announced, so you cannot tell whether an action worked',
  AMBIGUOUS_CONTROLS: 'several controls share an identical or empty name, so you cannot tell which one progresses the goal',
  CONTENT_NOT_REACHABLE: 'the page exposes almost nothing to assistive technology',
  UNKNOWN: 'none of the above fits',
};

/** WCAG 2.2 success criteria most directly failed by each category. */
export const CATEGORY_WCAG: Record<BlockerCategory, string[]> = {
  UNLABELLED_CONTROL: ['4.1.2'],
  FOCUS_NOT_TRAPPED: ['2.4.3'],
  FOCUS_ORDER_BROKEN: ['2.4.3'],
  KEYBOARD_TRAP: ['2.1.2'],
  NO_KEYBOARD_PATH: ['2.1.1'],
  MEANINGLESS_NAME: ['1.1.1', '2.4.4'],
  STATE_NOT_ANNOUNCED: ['4.1.3'],
  AMBIGUOUS_CONTROLS: ['2.4.6', '4.1.2'],
  CONTENT_NOT_REACHABLE: ['1.3.1', '4.1.2'],
  UNKNOWN: [],
};

/** F-10: declaring blocked before this step is refused, except for the categories below. */
export const MIN_STEPS_BEFORE_BLOCKED = 5;
export const IMMEDIATE_BLOCK_CATEGORIES = new Set<BlockerCategory>(['KEYBOARD_TRAP', 'CONTENT_NOT_REACHABLE']);
