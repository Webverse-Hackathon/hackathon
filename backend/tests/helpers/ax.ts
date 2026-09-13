/**
 * Builds AX snapshots in the same shape CDP returns, for tests that need a
 * specific tree rather than a recorded one.
 */

import type { AXNode, AXSnapshot } from '../../src/driver/types.js';

export interface NodeSpec {
  role: string;
  name?: string;
  value?: string;
  ignored?: boolean;
  props?: Record<string, string | number | boolean>;
  children?: NodeSpec[];
  /** Pin the node id, so the same element keeps its identity across two snapshots. */
  id?: number;
}

export function snapshot(root: NodeSpec, url = 'https://test.example/'): AXSnapshot {
  const nodes: AXNode[] = [];
  let next = 1000;

  const add = (spec: NodeSpec, parentId?: string): string => {
    const numericId = spec.id ?? next++;
    const nodeId = String(numericId);
    const node: AXNode = {
      nodeId,
      ignored: spec.ignored ?? false,
      role: { type: 'role', value: spec.role },
      backendDOMNodeId: numericId,
    };
    if (spec.name !== undefined) node.name = { type: 'computedString', value: spec.name };
    if (spec.value !== undefined) node.value = { type: 'string', value: spec.value };
    if (spec.props) {
      node.properties = Object.entries(spec.props).map(([name, value]) => ({
        name,
        value: { type: typeof value === 'boolean' ? 'booleanOrUndefined' : 'string', value },
      }));
    }
    if (parentId !== undefined) node.parentId = parentId;
    nodes.push(node);
    const childIds = (spec.children ?? []).map((child) => add(child, nodeId));
    if (childIds.length) node.childIds = childIds;
    return nodeId;
  };

  add(root);
  return { url, nodes };
}

/** A page: RootWebArea with a title, wrapping the given children. */
export function page(children: NodeSpec[], title = 'Test page', url?: string): AXSnapshot {
  return snapshot({ role: 'RootWebArea', name: title, id: 1, props: { focusable: true, focused: true }, children }, url);
}

export const text = (value: string, id?: number): NodeSpec => ({ role: 'StaticText', name: value, id });
