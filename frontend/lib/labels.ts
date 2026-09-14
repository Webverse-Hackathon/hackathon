import type { BlockerCategory, FixStage, RunStatus } from '@ally/shared';

export const CATEGORY_LABEL: Record<BlockerCategory, string> = {
  UNLABELLED_CONTROL: 'Unlabelled control',
  FOCUS_NOT_TRAPPED: 'Focus not moved into dialog',
  FOCUS_ORDER_BROKEN: 'Broken focus order',
  KEYBOARD_TRAP: 'Keyboard trap',
  NO_KEYBOARD_PATH: 'No keyboard path',
  MEANINGLESS_NAME: 'Meaningless name',
  STATE_NOT_ANNOUNCED: 'Change not announced',
  AMBIGUOUS_CONTROLS: 'Ambiguous controls',
  CONTENT_NOT_REACHABLE: 'Content not reachable',
  UNKNOWN: 'Unconfirmed claim',
};

export const WCAG_NAME: Record<string, string> = {
  '1.1.1': 'Non-text Content',
  '1.3.1': 'Info and Relationships',
  '2.1.1': 'Keyboard',
  '2.1.2': 'No Keyboard Trap',
  '2.4.3': 'Focus Order',
  '2.4.4': 'Link Purpose',
  '2.4.6': 'Headings and Labels',
  '4.1.2': 'Name, Role, Value',
  '4.1.3': 'Status Messages',
};

/** Status is always shown as a word and an icon, never by colour alone (D-07). */
export const STATUS_LABEL: Record<RunStatus, { text: string; icon: string; tone: 'neutral' | 'progress' | 'good' | 'bad' | 'warn' }> = {
  QUEUED: { text: 'Queued', icon: '◌', tone: 'neutral' },
  RUNNING: { text: 'Running', icon: '●', tone: 'progress' },
  SUCCEEDED: { text: 'Goal completed', icon: '✓', tone: 'good' },
  BLOCKED: { text: 'Blocked', icon: '✕', tone: 'bad' },
  ABANDONED: { text: 'Out of steps', icon: '◐', tone: 'warn' },
  ERRORED: { text: 'Errored', icon: '!', tone: 'warn' },
};

export const FIX_STAGES: { stage: FixStage | 'verify'; label: string }[] = [
  { stage: 'locate', label: 'Locate the JSX' },
  { stage: 'read', label: 'Read the source' },
  { stage: 'generate', label: 'Write the patch' },
  { stage: 'validate', label: 'Pass five gates' },
  { stage: 'pr', label: 'Open pull request' },
  { stage: 'verify', label: 'Re-run the goal' },
];

export const GATE_LABEL: Record<string, string> = {
  appliesCleanly: 'Applies cleanly',
  parses: 'Parses',
  typechecks: 'Typechecks',
  jsxA11y: 'jsx-a11y strict',
  sizeOk: 'Small change',
};

export function describeAction(tool: string, input: unknown): string {
  const value = (input ?? {}) as Record<string, unknown>;
  switch (tool) {
    case 'press_key':
      return `Press ${String(value.key)}`;
    case 'type_text':
      return `Type “${String(value.text)}”`;
    case 'read_focus':
      return 'Re-read the focused element';
    case 'declare_success':
      return 'Declare the goal complete';
    case 'declare_blocked':
      return 'Declare blocked';
    default:
      return tool;
  }
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  const seconds = ms / 1000;
  return seconds < 60 ? `${seconds.toFixed(1)} s` : `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
}

export function hostOf(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host + (parsed.pathname === '/' ? '' : parsed.pathname);
  } catch {
    return url;
  }
}
