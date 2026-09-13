/** Pure helpers over a recorded or live AX node list. No browser required. */

import type { AXNode } from './types.js';

export function stringOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function roleOf(node: AXNode): string {
  return stringOf(node.role?.value);
}

export function nameOf(node: AXNode): string {
  return stringOf(node.name?.value).trim();
}

export function propertyOf(node: AXNode, name: string): unknown {
  return node.properties?.find((property) => property.name === name)?.value.value;
}

/**
 * The node that has keyboard focus. Chromium marks the RootWebArea as focused
 * whenever the document has focus, so the focused control is the focused node
 * that is not the root. Falls back to the root when nothing inside has focus.
 * (Found against the real broken-shop tree; see docs/09 F-64.)
 */
export function focusedNode(nodes: AXNode[]): AXNode | undefined {
  let root: AXNode | undefined;
  for (const node of nodes) {
    if (node.ignored || propertyOf(node, 'focused') !== true) continue;
    if (roleOf(node) === 'RootWebArea') {
      root ??= node;
      continue;
    }
    return node;
  }
  return root;
}
