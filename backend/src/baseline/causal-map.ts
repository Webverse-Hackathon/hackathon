import type { BlockerCategory } from '@ally/shared';

/**
 * Which axe rules could plausibly be the cause of each blocker category. An axe
 * finding counts as "the reason the agent stopped" only when its rule is listed
 * here for the blocker's category AND its element is the blocking element (or
 * inside it, or contains it). Anything looser would let an unrelated
 * colour-contrast finding claim credit for a missing name.
 */
export const CAUSAL_RULES: Record<BlockerCategory, readonly string[]> = {
  UNLABELLED_CONTROL: [
    'button-name',
    'link-name',
    'input-button-name',
    'aria-command-name',
    'aria-input-field-name',
    'aria-toggle-field-name',
    'label',
    'select-name',
    'nested-interactive',
    'role-img-alt',
    'svg-img-alt',
  ],
  FOCUS_NOT_TRAPPED: ['aria-dialog-name', 'aria-hidden-focus'],
  FOCUS_ORDER_BROKEN: ['tabindex', 'focus-order-semantics'],
  KEYBOARD_TRAP: ['scrollable-region-focusable', 'frame-focusable-content'],
  NO_KEYBOARD_PATH: ['scrollable-region-focusable', 'nested-interactive', 'aria-hidden-focus'],
  MEANINGLESS_NAME: ['image-alt', 'image-redundant-alt', 'link-name', 'button-name'],
  STATE_NOT_ANNOUNCED: ['aria-allowed-attr', 'aria-valid-attr-value'],
  AMBIGUOUS_CONTROLS: ['identical-links-same-purpose', 'button-name', 'link-name'],
  CONTENT_NOT_REACHABLE: ['region', 'landmark-one-main', 'page-has-heading-one', 'aria-hidden-body'],
  UNKNOWN: [],
};
