/**
 * axe-core against the agent's page, and the DOM-side facts about the blocking
 * element that the report and the fixer need (its HTML, its DOM path, and the
 * element a fix should change).
 *
 * Privileged: this reaches the Playwright page. It is called by runs/, never
 * by agent/, and nothing it returns is ever put in a prompt the agent sees.
 */

import AxeBuilder from '@axe-core/playwright';
import type { AxeFindingInfo } from '@ally/shared';
import { internalsOf } from '../driver/internal.js';
import type { DriverSession } from '../driver/types.js';
import type { FixTarget } from '../runs/store.js';
import type { RawAxeFinding } from './correlate.js';

const IMPACTS = new Set(['minor', 'moderate', 'serious', 'critical']);

interface ElementHandleRef {
  objectId: string;
}

async function resolveBackendNode(session: DriverSession, backendNodeId: number): Promise<ElementHandleRef | null> {
  const { cdp } = internalsOf(session);
  try {
    await cdp.send('DOM.getDocument', { depth: 0 });
    const resolved = (await cdp.send('DOM.resolveNode', { backendNodeId })) as { object?: { objectId?: string } };
    return resolved.object?.objectId ? { objectId: resolved.object.objectId } : null;
  } catch {
    return null;
  }
}

/**
 * Runs inside the page with `this` bound to the blocking DOM node. Finds the
 * element a fix should change: the node itself, or the nearest ancestor that
 * behaves like a control (a native control, a role, a tabindex, or a pointer
 * cursor, which is how a <div onClick> gives itself away).
 *
 * With preferOverlay (a FOCUS_NOT_TRAPPED blocker) the target is the visible
 * full-screen overlay that is not a modal dialog: the agent cannot name it,
 * because without a role it is not in the accessibility tree at all.
 *
 * With unreachable (CONTENT_NOT_REACHABLE, NO_KEYBOARD_PATH) the target must be
 * something the keyboard cannot reach. When the node the agent named (or the one
 * that merely had focus) is reachable, it cannot be the blocker, so the page is
 * searched for a clickable element with no keyboard path instead (F-82).
 */
const INSPECT_FUNCTION = `function (preferOverlay, unreachable) {
  var start = this.nodeType === 1 ? this : this.parentElement;
  if (!start) return null;
  function declaresPointer(el) {
    // cursor is inherited: only the element that declares the pointer is the control,
    // not the icon inside it.
    if (window.getComputedStyle(el).cursor !== 'pointer') return false;
    return !el.parentElement || window.getComputedStyle(el.parentElement).cursor !== 'pointer';
  }
  function looksInteractive(el) {
    var tag = el.tagName.toLowerCase();
    if (['a', 'button', 'input', 'select', 'textarea', 'summary'].indexOf(tag) >= 0) return true;
    if (el.hasAttribute('role') || el.hasAttribute('tabindex') || el.hasAttribute('onclick')) return true;
    return declaresPointer(el);
  }
  function keyboardReachable(el) {
    return el.tabIndex >= 0 && !el.disabled && el.getClientRects().length > 0;
  }
  // A <div onClick> and its kind: visible, clickable, and not in the tab order.
  function clickableButUnreachable(el) {
    if (el.tabIndex >= 0 || el.getClientRects().length === 0) return false;
    var tag = el.tagName.toLowerCase();
    if (['a', 'button', 'input', 'select', 'textarea', 'summary', 'label', 'option', 'body', 'html'].indexOf(tag) >= 0) return false;
    return el.hasAttribute('onclick') || declaresPointer(el);
  }
  function domPath(el) {
    var parts = [];
    while (el && el.nodeType === 1 && el.tagName.toLowerCase() !== 'html' && parts.length < 7) {
      var part = el.tagName.toLowerCase();
      if (el.classList.length) part += '.' + Array.prototype.slice.call(el.classList, 0, 2).join('.');
      var parent = el.parentElement;
      if (parent) {
        var same = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === el.tagName; });
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(el) + 1) + ')';
      }
      parts.unshift(part);
      el = parent;
    }
    return parts.join(' > ');
  }
  function nameless(el) {
    return !(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.textContent || '').trim());
  }
  var target = null;
  if (preferOverlay) {
    var area = window.innerWidth * window.innerHeight;
    var overlays = Array.prototype.filter.call(document.body.querySelectorAll('*'), function (el) {
      var style = window.getComputedStyle(el);
      if (style.position !== 'fixed' || style.display === 'none' || style.visibility === 'hidden') return false;
      if (el.getAttribute('role') === 'dialog' && el.getAttribute('aria-modal') === 'true') return false;
      var rect = el.getBoundingClientRect();
      return rect.width * rect.height >= area * 0.25;
    });
    if (overlays.length) {
      target = overlays[overlays.length - 1];
      // Report the overlay itself, not the node the search started from (often the body).
      start = target;
    }
  }
  var cursor = target ? null : start;
  for (var depth = 0; cursor && depth < 6; depth++) {
    if (cursor.tagName.toLowerCase() === 'body') break;
    if (looksInteractive(cursor)) { target = cursor; break; }
    cursor = cursor.parentElement;
  }
  // The agent often names what it could hear (an image beside the control) rather
  // than the control it could not. Look for a nameless control in the same card.
  var container = target ? null : start.parentElement;
  for (var up = 0; !target && container && up < 3; up++) {
    if (container.tagName.toLowerCase() === 'body') break;
    var found = Array.prototype.find.call(container.querySelectorAll('*'), function (el) {
      return el !== start && looksInteractive(el) && nameless(el);
    });
    if (found) target = found;
    container = container.parentElement;
  }
  var isBody = start.tagName.toLowerCase() === 'body';
  if (unreachable && !(target && clickableButUnreachable(target))) {
    // Group the page's unreachable clickables by tag and class: one group is one source
    // element, often rendered in a loop. More than one group would be a guess.
    var groups = {};
    Array.prototype.forEach.call(document.body.querySelectorAll('*'), function (el) {
      if (!clickableButUnreachable(el)) return;
      var key = el.tagName + '.' + (el.getAttribute('class') || '');
      if (!groups[key]) groups[key] = el;
    });
    var keys = Object.keys(groups);
    if (keys.length === 1) target = groups[keys[0]];
    if (!target || keyboardReachable(target)) {
      window.__allyFixTarget = null;
      return { node: { outerHtml: clip(start.outerHTML), domPath: domPath(start) }, target: null };
    }
  }
  // With no node named, report the element found rather than the page body.
  if (isBody && target) start = target;
  if (!target) target = start;
  function clip(html) { return html.length > 600 ? html.slice(0, 600) + '…' : html; }
  window.__allyFixTarget = target;
  return {
    node: { outerHtml: clip(start.outerHTML), domPath: domPath(start) },
    target: {
      tagName: target.tagName.toLowerCase(),
      className: target.getAttribute('class'),
      outerHtml: clip(target.outerHTML),
      domPath: domPath(target),
      textContent: (target.textContent || '').trim().slice(0, 200)
    }
  };
}`;

export interface BlockerDomFacts {
  domPath: string;
  htmlSnippet: string;
  /** Null when no element can honestly be named: the fix is then unavailable, not guessed. */
  fixTarget: FixTarget | null;
}

async function bodyRef(session: DriverSession): Promise<ElementHandleRef | null> {
  const { cdp } = internalsOf(session);
  try {
    const evaluated = (await cdp.send('Runtime.evaluate', { expression: 'document.body' })) as { result: { objectId?: string } };
    return evaluated.result.objectId ? { objectId: evaluated.result.objectId } : null;
  } catch {
    return null;
  }
}

export async function inspectBlocker(
  session: DriverSession,
  backendNodeId: number | null,
  options: { preferOverlay: boolean; unreachable: boolean },
): Promise<BlockerDomFacts | null> {
  // With no node, an overlay or unreachable-control search can still start from the page body.
  const searchesPage = options.preferOverlay || options.unreachable;
  const ref = backendNodeId !== null ? await resolveBackendNode(session, backendNodeId) : searchesPage ? await bodyRef(session) : null;
  if (!ref) return null;
  const { cdp } = internalsOf(session);
  try {
    const result = (await cdp.send('Runtime.callFunctionOn', {
      objectId: ref.objectId,
      functionDeclaration: INSPECT_FUNCTION,
      arguments: [{ value: options.preferOverlay }, { value: options.unreachable }],
      returnByValue: true,
    })) as { result: { value?: { node: { outerHtml: string; domPath: string }; target: FixTarget | null } | null } };
    const value = result.result.value;
    if (!value) return null;
    return { domPath: value.node.domPath, htmlSnippet: value.node.outerHtml, fixTarget: value.target };
  } catch {
    return null;
  }
}

/** For each selector: is its element the fix target, inside it, or around it? Needs inspectBlocker first. */
async function overlapsFixTarget(session: DriverSession, selectors: string[]): Promise<boolean[]> {
  if (selectors.length === 0) return [];
  const { page } = internalsOf(session);
  const script = `(function (list) {
    var target = window.__allyFixTarget;
    return list.map(function (selector) {
      if (!target) return false;
      var element = null;
      try { element = document.querySelector(selector); } catch (e) { return false; }
      return !!element && (element === target || target.contains(element) || element.contains(target));
    });
  })(${JSON.stringify(selectors)})`;
  try {
    return (await page.evaluate(script)) as boolean[];
  } catch {
    return selectors.map(() => false);
  }
}

/**
 * One scan. Returns null when axe could not run, so the caller never reports a
 * false zero. Overlap with the blocker is filled in afterwards by markOverlaps.
 */
export async function runAxe(session: DriverSession, phase: AxeFindingInfo['phase']): Promise<RawAxeFinding[] | null> {
  const { page } = internalsOf(session);
  let violations;
  try {
    ({ violations } = await new AxeBuilder({ page }).analyze());
  } catch {
    return null;
  }

  const findings: Omit<RawAxeFinding, 'overlapsBlocker'>[] = [];
  for (const violation of violations) {
    for (const node of violation.nodes) {
      const first = node.target[0];
      const selector = Array.isArray(first) ? first.join(' ') : String(first ?? '');
      findings.push({
        phase,
        ruleId: violation.id,
        impact: violation.impact && IMPACTS.has(violation.impact) ? (violation.impact as AxeFindingInfo['impact']) : null,
        wcagTags: violation.tags.filter((tag) => tag.startsWith('wcag')),
        description: violation.help,
        helpUrl: violation.helpUrl ?? null,
        targetSelector: selector,
        backendNodeId: null,
      });
    }
  }

  return findings.map((finding) => ({ ...finding, overlapsBlocker: false }));
}

/**
 * Marks which findings sit on the element inspectBlocker chose. Only meaningful
 * while the page is still the one the findings came from; the caller checks.
 */
export async function markOverlaps(session: DriverSession, findings: RawAxeFinding[]): Promise<void> {
  const overlaps = await overlapsFixTarget(session, findings.map((finding) => finding.targetSelector));
  findings.forEach((finding, index) => {
    finding.overlapsBlocker = overlaps[index] ?? false;
  });
}
