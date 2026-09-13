/**
 * A stable hash of what the tree says, for stabilisation (F-05) and loop
 * detection (F-11). Pure: usable from agent/ and from tests with no browser.
 *
 * Normalised before hashing so a ticking clock does not count as a change:
 * numeric-only text is dropped, and the contents of live regions are dropped.
 */

import { createHash } from 'node:crypto';
import type { AXNode, AXSnapshot } from './types.js';

const IMPLICIT_LIVE_ROLES = new Set(['status', 'alert', 'log', 'marquee', 'timer']);

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : value === undefined ? '' : JSON.stringify(value);
}

export function isLiveRegionRoot(node: AXNode): boolean {
  const role = stringValue(node.role?.value);
  if (IMPLICIT_LIVE_ROLES.has(role)) return true;
  const live = node.properties?.find((property) => property.name === 'live');
  const setting = stringValue(live?.value.value);
  return setting === 'polite' || setting === 'assertive';
}

function isNumericOnly(text: string): boolean {
  return /^[\s\d.,:%$£€+-]+$/.test(text) && /\d/.test(text);
}

export function normalisedTreeText(snapshot: AXSnapshot): string {
  const byId = new Map(snapshot.nodes.map((node) => [node.nodeId, node]));
  const insideLive = new Set<string>();
  for (const node of snapshot.nodes) {
    if (!isLiveRegionRoot(node)) continue;
    const stack = [...(node.childIds ?? [])];
    while (stack.length) {
      const id = stack.pop();
      if (id === undefined || insideLive.has(id)) continue;
      insideLive.add(id);
      stack.push(...(byId.get(id)?.childIds ?? []));
    }
  }

  const parts: string[] = [];
  for (const node of snapshot.nodes) {
    if (node.ignored || insideLive.has(node.nodeId)) continue;
    const role = stringValue(node.role?.value);
    if (role === 'InlineTextBox') continue;
    const name = stringValue(node.name?.value);
    if ((role === 'StaticText' || role === 'text') && isNumericOnly(name)) continue;
    const props = (node.properties ?? [])
      .filter((property) => property.name !== 'focusable' && property.name !== 'settable')
      .map((property) => `${property.name}=${stringValue(property.value.value)}`)
      .sort()
      .join(',');
    parts.push(`${node.backendDOMNodeId ?? node.nodeId}|${role}|${name}|${stringValue(node.value?.value)}|${props}`);
  }
  return `${snapshot.url}\n${parts.join('\n')}`;
}

export function hashSnapshot(snapshot: AXSnapshot): string {
  return createHash('sha256').update(normalisedTreeText(snapshot)).digest('hex');
}
