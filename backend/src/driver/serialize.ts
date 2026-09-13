/**
 * Perception: the accessibility tree turned into what a screen reader would
 * actually say. Pure and synchronous, so it is tested against recorded trees
 * with no browser (docs/10-TEST-CASES.md S-01 to S-16).
 *
 * Two modes:
 *  - full read, when there is no previous tree or the page changed: every
 *    meaningful node, in document order, truncated around focus;
 *  - diff, after a keystroke: only what a screen reader would announce —
 *    live-region changes, a newly opened dialog, and the newly focused node.
 *    Content that silently appears elsewhere is NOT announced, because a
 *    screen-reader user would not hear it either.
 */

import type { TranscriptLine } from '@ally/shared';
import { isLiveRegionRoot } from './hash.js';
import { focusedNode, nameOf, propertyOf, roleOf, stringOf } from './tree.js';
import type { AXNode, AXSnapshot } from './types.js';

export const DEFAULT_MAX_LINES = 400;
const MAX_NAME_LENGTH = 200;

export const EMPTY_PAGE_LINE = 'the page exposes no content to assistive technology.';
export const NOTHING_ANNOUNCED_LINE = 'nothing new was announced.';
export const UNAVAILABLE_FRAME_LINE = 'frame, contents not available to this run.';

export interface SerializeOptions {
  maxLines?: number;
}

// ─── Vocabulary ──────────────────────────────────────────────────────────────

const ROLE_WORDS: Record<string, string> = {
  textbox: 'edit',
  searchbox: 'search edit',
  combobox: 'combo box',
  PopUpButton: 'pop up button',
  img: 'image',
  image: 'image',
  radio: 'radio button',
  menuitem: 'menu item',
  menuitemcheckbox: 'menu item checkbox',
  menuitemradio: 'menu item radio',
  ListBoxOption: 'option',
  spinbutton: 'spin button',
  treeitem: 'tree item',
  contentinfo: 'content info',
  alertdialog: 'alert dialog',
};

/** Announced with their name, and their descendants are not read separately. */
const LEAF_ROLES = new Set([
  'button',
  'link',
  'checkbox',
  'radio',
  'switch',
  'tab',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'ListBoxOption',
  'treeitem',
  'image',
  'img',
  'textbox',
  'searchbox',
  'combobox',
  'PopUpButton',
  'slider',
  'spinbutton',
  'progressbar',
  'heading',
]);

export const LANDMARK_ROLES = new Set([
  'banner',
  'navigation',
  'main',
  'contentinfo',
  'complementary',
  'search',
  'form',
  'region',
]);

/** Only announced when they carry a name; otherwise they are anonymous wrappers. */
const NAMED_ONLY_LANDMARKS = new Set(['form', 'region']);

const DIALOG_ROLES = new Set(['dialog', 'alertdialog']);

/** Pure structure: not announced, children read in place. */
const TRANSPARENT_ROLES = new Set([
  'generic',
  'none',
  'presentation',
  'paragraph',
  'Section',
  'listitem',
  'group',
  'row',
  'cell',
  'gridcell',
  'rowgroup',
  'Pre',
  'Abbr',
  'blockquote',
  'figure',
  'caption',
  'emphasis',
  'strong',
  'code',
  'time',
  'mark',
  'insertion',
  'deletion',
  'subscript',
  'superscript',
  'term',
  'definition',
  'DescriptionList',
  'DescriptionListTerm',
  'DescriptionListDetail',
  'Ruby',
  'status',
  'alert',
  'log',
  'marquee',
  'timer',
]);

const SKIPPED_ROLES = new Set(['InlineTextBox', 'LineBreak', 'separator', 'LabelText']);

const TEXT_ROLES = new Set(['StaticText', 'text']);

const IFRAME_ROLES = new Set(['Iframe', 'IframePresentational']);

const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const TENS_WORDS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** The word a screen reader uses for a role, e.g. textbox → "edit". */
export function spokenRole(role: string): string {
  if (role === 'generic' || role === 'none') return 'group';
  return ROLE_WORDS[role] ?? role;
}

export function numberToWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999) return String(n);
  if (n < 20) return NUMBER_WORDS[n] ?? String(n);
  if (n < 100) {
    const tens = TENS_WORDS[Math.floor(n / 10)] ?? '';
    const ones = n % 10;
    return ones === 0 ? tens : `${tens}-${NUMBER_WORDS[ones] ?? ''}`;
  }
  const hundreds = `${NUMBER_WORDS[Math.floor(n / 100)] ?? ''} hundred`;
  const rest = n % 100;
  return rest === 0 ? hundreds : `${hundreds} ${numberToWords(rest)}`;
}

// ─── Flags ───────────────────────────────────────────────────────────────────

const FILENAME_PATTERN = /^[\w\s.()-]+\.(png|jpe?g|gif|svg|webp|avif|bmp|tiff?|ico|heic)$/i;
const HASH_PATTERN = /^[a-f0-9]{16,}$/i;
const URL_PATTERN = /^(https?:\/\/|www\.)\S+$/i;

/** A name that is a filename, a hash or a URL. Feeds MEANINGLESS_NAME. */
export function isSuspiciousName(name: string): boolean {
  const trimmed = name.trim();
  return FILENAME_PATTERN.test(trimmed) || HASH_PATTERN.test(trimmed) || URL_PATTERN.test(trimmed);
}

const INJECTION_PATTERNS = [
  /\bignore (all |any |the |your )?(previous |prior |above )?(instructions|rules|prompts?)\b/i,
  /\bdisregard (all |any |the |your )?(previous |prior )?(instructions|rules)\b/i,
  /\b(system|assistant|developer)\s*:/i,
  /\bdeclare (success|the goal|victory)\b/i,
  /\b(the )?goal (is|has been) (complete|completed|achieved|done)\b/i,
  /\byou are (an? |the )?(ai|assistant|agent|language model)\b/i,
  /\b(call|use) the \w+ tool\b/i,
];

/** Text that looks like an instruction aimed at an assistant rather than a person. F-14. */
export function looksLikeInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

// ─── Lines ───────────────────────────────────────────────────────────────────

function clip(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > MAX_NAME_LENGTH ? `${collapsed.slice(0, MAX_NAME_LENGTH)}…` : collapsed;
}

function sentence(parts: string[]): string {
  const body = parts.filter((part) => part !== '').join(', ');
  return /[.!?…]$/.test(body) ? body : `${body}.`;
}

function statesOf(node: AXNode): string[] {
  const states: string[] = [];
  const checked = stringOf(propertyOf(node, 'checked'));
  if (checked === 'true') states.push('checked');
  else if (checked === 'false') states.push('not checked');
  else if (checked === 'mixed') states.push('partially checked');

  const pressed = stringOf(propertyOf(node, 'pressed'));
  if (pressed === 'true') states.push('pressed');
  else if (pressed === 'false') states.push('not pressed');
  else if (pressed === 'mixed') states.push('partially pressed');

  const expanded = propertyOf(node, 'expanded');
  if (expanded === true) states.push('expanded');
  else if (expanded === false) states.push('collapsed');

  if (propertyOf(node, 'selected') === true) states.push('selected');
  if (propertyOf(node, 'disabled') === true) states.push('unavailable');
  if (propertyOf(node, 'readonly') === true && roleOf(node) !== 'RootWebArea') states.push('read only');
  if (propertyOf(node, 'required') === true) states.push('required');

  const invalid = stringOf(propertyOf(node, 'invalid'));
  if (invalid !== '' && invalid !== 'false') states.push('invalid entry');

  const popup = stringOf(propertyOf(node, 'hasPopup'));
  if (popup !== '' && popup !== 'false') states.push('has pop up');
  return states;
}

function makeLine(node: AXNode, spoken: string, extra: Partial<TranscriptLine> = {}): TranscriptLine {
  const name = clip(nameOf(node));
  const line: TranscriptLine = {
    axNodeId: node.nodeId,
    role: roleOf(node),
    name: name === '' ? null : name,
    states: [],
    spoken,
    ...extra,
  };
  if (name !== '' && isSuspiciousName(name)) line.suspiciousName = true;
  if (looksLikeInjection(`${name} ${spoken}`)) line.possibleInjection = true;
  return line;
}

function noteLine(spoken: string): TranscriptLine {
  return { axNodeId: '', role: 'note', name: null, states: [], spoken };
}

/** The sentence for a node announced in its own right: role, name, value, states. */
export function describeNode(node: AXNode, byId?: Map<string, AXNode>): TranscriptLine {
  const role = roleOf(node);
  const name = clip(nameOf(node));
  const states = statesOf(node);

  if (role === 'heading') {
    const level = Number(propertyOf(node, 'level'));
    const levelWords = Number.isInteger(level) && level > 0 ? ` level ${numberToWords(level)}` : '';
    const line = makeLine(node, sentence([`heading${levelWords}`, name, ...states]), { states });
    if (levelWords) line.level = level;
    return line;
  }

  if (role === 'list' && byId) {
    const count = countListItems(node, byId);
    const itemWord = count === 1 ? 'item' : 'items';
    return makeLine(node, sentence(['list', name, `${numberToWords(count)} ${itemWord}`]), { states, setSize: count });
  }

  const roleWord = spokenRole(role);
  const value = clip(stringOf(node.value?.value));
  const showValue = value !== '' && value !== name;
  const line = makeLine(node, sentence([roleWord, name, showValue ? value : '', ...states]), { states });
  if (showValue) line.value = value;
  return line;
}

function countListItems(list: AXNode, byId: Map<string, AXNode>): number {
  let count = 0;
  const stack = [...(list.childIds ?? [])].reverse();
  while (stack.length) {
    const id = stack.pop();
    const child = id === undefined ? undefined : byId.get(id);
    if (!child) continue;
    const role = roleOf(child);
    if (role === 'listitem' && !child.ignored) {
      count++;
      continue;
    }
    // Look through anonymous wrappers, never into a nested list.
    if (child.ignored || role === 'generic' || role === 'none') stack.push(...[...(child.childIds ?? [])].reverse());
  }
  return count;
}

// ─── Walking ─────────────────────────────────────────────────────────────────

interface Walk {
  byId: Map<string, AXNode>;
  lines: TranscriptLine[];
}

function walk(nodeId: string, state: Walk, landmarkRole: string | null): void {
  const node = state.byId.get(nodeId);
  if (!node) return;
  const role = roleOf(node);
  const children = node.childIds ?? [];
  const visitChildren = (landmark: string | null) => {
    for (const child of children) walk(child, state, landmark);
  };

  if (SKIPPED_ROLES.has(role)) return;
  // Ignored nodes are omitted, but their unignored descendants are still read (S-08, S-09).
  if (node.ignored || role === 'RootWebArea') return visitChildren(landmarkRole);

  const name = nameOf(node);

  if (TEXT_ROLES.has(role)) {
    if (name !== '') state.lines.push(makeLine(node, sentence([clip(name)])));
    return;
  }

  if (IFRAME_ROLES.has(role)) {
    if (children.length === 0) state.lines.push(makeLine(node, UNAVAILABLE_FRAME_LINE));
    else visitChildren(landmarkRole);
    return;
  }

  if (LEAF_ROLES.has(role)) {
    state.lines.push(describeNode(node, state.byId));
    return;
  }

  if (LANDMARK_ROLES.has(role)) {
    const anonymous = name === '';
    const hidden = (NAMED_ONLY_LANDMARKS.has(role) && anonymous) || (role === landmarkRole && anonymous);
    if (!hidden) state.lines.push(describeNode(node, state.byId));
    return visitChildren(hidden ? landmarkRole : role);
  }

  if (DIALOG_ROLES.has(role) || role === 'list' || role === 'table' || role === 'grid' || role === 'tree' ||
      role === 'listbox' || role === 'menu' || role === 'menubar' || role === 'tablist' || role === 'toolbar' ||
      role === 'radiogroup') {
    state.lines.push(describeNode(node, state.byId));
    return visitChildren(landmarkRole);
  }

  if (TRANSPARENT_ROLES.has(role) || name === '') {
    // A focusable anonymous wrapper is still something Tab lands on; say so.
    if (propertyOf(node, 'focusable') === true && name === '' && role !== 'status' && role !== 'alert') {
      state.lines.push(describeNode(node, state.byId));
    } else if (role === 'group' && name !== '') {
      state.lines.push(describeNode(node, state.byId));
    }
    return visitChildren(landmarkRole);
  }

  state.lines.push(describeNode(node, state.byId));
  visitChildren(landmarkRole);
}

function rootOf(snapshot: AXSnapshot): AXNode | undefined {
  return snapshot.nodes.find((node) => node.parentId === undefined) ?? snapshot.nodes[0];
}

function indexById(snapshot: AXSnapshot): Map<string, AXNode> {
  return new Map(snapshot.nodes.map((node) => [node.nodeId, node]));
}

function identity(node: AXNode): string {
  return node.backendDOMNodeId !== undefined ? `b${node.backendDOMNodeId}` : `n${node.nodeId}`;
}

// ─── Full read ───────────────────────────────────────────────────────────────

function truncate(lines: TranscriptLine[], focusId: string | null, maxLines: number): TranscriptLine[] {
  if (lines.length <= maxLines) return lines;
  const budget = maxLines - 1; // one line for the marker
  const priority = new Set<number>();
  lines.forEach((line, index) => {
    if (LANDMARK_ROLES.has(line.role) || line.role === 'heading' || DIALOG_ROLES.has(line.role)) priority.add(index);
  });
  if (priority.size > budget / 2) priority.clear(); // too many to keep them all and still read around focus

  const focusIndex = Math.max(0, focusId === null ? 0 : lines.findIndex((line) => line.axNodeId === focusId));
  const keep = new Set(priority);
  let lo = focusIndex;
  let hi = focusIndex;
  keep.add(focusIndex);
  while (keep.size < budget && (lo > 0 || hi < lines.length - 1)) {
    if (hi < lines.length - 1) keep.add(++hi);
    if (keep.size < budget && lo > 0) keep.add(--lo);
  }

  const kept = lines.filter((_, index) => keep.has(index));
  kept.push(noteLine(`[${lines.length - kept.length} further items not read]`));
  return kept;
}

function fullRead(snapshot: AXSnapshot, maxLines: number): TranscriptLine[] {
  const root = rootOf(snapshot);
  if (!root) return [noteLine(EMPTY_PAGE_LINE)];
  const byId = indexById(snapshot);
  const state: Walk = { byId, lines: [] };
  walk(root.nodeId, state, null);
  if (state.lines.length === 0) return [noteLine(EMPTY_PAGE_LINE)];

  const focused = focusedNode(snapshot.nodes);
  const focusId = focused && roleOf(focused) !== 'RootWebArea' ? focused.nodeId : null;
  // Reserve two lines for the page title and the focus note, so the total stays within maxLines.
  const lines = truncate(state.lines, focusId, maxLines - 2);

  const title = clip(nameOf(root));
  if (title !== '') lines.unshift(makeLine(root, sentence(['page', title])));
  lines.push(focusNote(focused, byId));
  return lines;
}

function focusNote(focused: AXNode | undefined, byId: Map<string, AXNode>): TranscriptLine {
  if (!focused || roleOf(focused) === 'RootWebArea') return noteLine('focus is at the start of the page.');
  const spoken = describeNode(focused, byId).spoken.replace(/\.$/, '');
  return { ...noteLine(`focus is on ${spoken}.`), axNodeId: focused.nodeId };
}

// ─── Diff ────────────────────────────────────────────────────────────────────

function liveRegionText(region: AXNode, byId: Map<string, AXNode>): string {
  const parts: string[] = [];
  const stack = [...(region.childIds ?? [])].reverse();
  while (stack.length) {
    const id = stack.pop();
    const node = id === undefined ? undefined : byId.get(id);
    if (!node) continue;
    if (TEXT_ROLES.has(roleOf(node)) && !node.ignored) {
      const text = nameOf(node);
      if (text !== '') parts.push(text);
      continue;
    }
    stack.push(...[...(node.childIds ?? [])].reverse());
  }
  return clip(parts.join(' '));
}

function comparableUrl(url: string): string {
  const hashIndex = url.indexOf('#');
  return hashIndex === -1 ? url : url.slice(0, hashIndex);
}

function isInside(node: AXNode, ancestorId: string, byId: Map<string, AXNode>): boolean {
  let current: AXNode | undefined = node;
  for (let depth = 0; current && depth < 500; depth++) {
    if (current.nodeId === ancestorId) return true;
    current = current.parentId === undefined ? undefined : byId.get(current.parentId);
  }
  return false;
}

function diffRead(current: AXSnapshot, previous: AXSnapshot): TranscriptLine[] {
  const byId = indexById(current);
  const previousById = indexById(previous);
  const previousByIdentity = new Map(previous.nodes.map((node) => [identity(node), node]));
  const lines: TranscriptLine[] = [];

  // 1. Live regions interrupt first (S-10).
  for (const region of current.nodes) {
    if (region.ignored || !isLiveRegionRoot(region)) continue;
    const text = liveRegionText(region, byId);
    if (text === '') continue;
    const before = previousByIdentity.get(identity(region));
    const beforeText = before ? liveRegionText(before, previousById) : '';
    if (text !== beforeText) {
      lines.push(makeLine(region, sentence([text]), { states: ['announcement'] }));
    }
  }

  const focused = focusedNode(current.nodes);
  const previousFocused = focusedNode(previous.nodes);

  // 2. A dialog that was not there before: read it, and say where focus is (S-12).
  const openedDialogs = current.nodes.filter((node) => {
    if (node.ignored || !DIALOG_ROLES.has(roleOf(node))) return false;
    const before = previousByIdentity.get(identity(node));
    return !before || before.ignored;
  });
  let focusCovered = false;
  for (const dialog of openedDialogs) {
    const state: Walk = { byId, lines: [] };
    walk(dialog.nodeId, state, null);
    lines.push(...state.lines);
    const inside = focused !== undefined && isInside(focused, dialog.nodeId, byId);
    lines.push({ ...noteLine(inside ? 'focus is inside the dialog.' : 'focus is still outside the dialog.'), axNodeId: dialog.nodeId });
    if (inside) focusCovered = true;
  }

  // 3. The newly focused node, or the focused node's changed state (S-11).
  if (!focusCovered) {
    const focusMoved = identity(focused ?? { nodeId: '', ignored: true }) !==
      identity(previousFocused ?? { nodeId: '', ignored: true });
    if (focused && roleOf(focused) !== 'RootWebArea') {
      const now = describeNode(focused, byId);
      const before = previousFocused ? describeNode(previousFocused, previousById).spoken : null;
      if (focusMoved || now.spoken !== before) lines.push(now);
    } else if (focusMoved) {
      lines.push(noteLine('focus left the page content.'));
    }
  }

  return lines.length > 0 ? lines : [noteLine(NOTHING_ANNOUNCED_LINE)];
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * What a screen reader would say for `current`, given what it said for
 * `previous`. Pass `previous = null` for the first snapshot of a run.
 */
export function serialize(
  current: AXSnapshot,
  previous: AXSnapshot | null,
  options: SerializeOptions = {},
): TranscriptLine[] {
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  if (!previous) return fullRead(current, maxLines);

  const previousRoot = rootOf(previous);
  const currentRoot = rootOf(current);
  const navigated =
    comparableUrl(current.url) !== comparableUrl(previous.url) ||
    (previousRoot && currentRoot && identity(previousRoot) !== identity(currentRoot));
  return navigated ? fullRead(current, maxLines) : diffRead(current, previous);
}

/** The full read of the current page, whatever came before. Used by read_focus-style re-reads and tests. */
export function readPage(snapshot: AXSnapshot, options: SerializeOptions = {}): TranscriptLine[] {
  return fullRead(snapshot, options.maxLines ?? DEFAULT_MAX_LINES);
}
