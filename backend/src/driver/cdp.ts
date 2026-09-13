/**
 * Raw Chrome DevTools Protocol calls. Accessibility.getFullAXTree is used rather
 * than Playwright's accessibility snapshot because only CDP returns a
 * backendDOMNodeId on every node (DECISIONS.md #5).
 */

import type { CDPSession } from 'playwright';
import type { AXNode, AXProperty, AXValue } from './types.js';

interface RawAXValue {
  type: string;
  value?: unknown;
}

interface RawAXNode {
  nodeId: string;
  ignored: boolean;
  role?: RawAXValue;
  name?: RawAXValue;
  value?: RawAXValue;
  properties?: { name: string; value: RawAXValue }[];
  parentId?: string;
  childIds?: string[];
  backendDOMNodeId?: number;
}

function copyValue(raw: RawAXValue | undefined): AXValue | undefined {
  if (!raw) return undefined;
  return raw.value === undefined ? { type: raw.type } : { type: raw.type, value: raw.value };
}

/**
 * Copies only the fields we keep. Anything else CDP adds in a future version is
 * dropped here, so it cannot leak into a prompt unreviewed.
 */
function copyNode(raw: RawAXNode): AXNode {
  const node: AXNode = { nodeId: raw.nodeId, ignored: raw.ignored };
  const role = copyValue(raw.role);
  const name = copyValue(raw.name);
  const value = copyValue(raw.value);
  if (role) node.role = role;
  if (name) node.name = name;
  if (value) node.value = value;
  if (raw.properties?.length) {
    node.properties = raw.properties.map(
      (property): AXProperty => ({ name: property.name, value: copyValue(property.value) ?? { type: 'none' } }),
    );
  }
  if (raw.parentId !== undefined) node.parentId = raw.parentId;
  if (raw.childIds?.length) node.childIds = [...raw.childIds];
  if (raw.backendDOMNodeId !== undefined) node.backendDOMNodeId = raw.backendDOMNodeId;
  return node;
}

export async function enableDomains(cdp: CDPSession): Promise<void> {
  await cdp.send('DOM.enable');
  await cdp.send('Accessibility.enable');
}

export async function getFullAXTree(cdp: CDPSession): Promise<AXNode[]> {
  const result = (await cdp.send('Accessibility.getFullAXTree')) as { nodes: RawAXNode[] };
  return result.nodes.map(copyNode);
}
