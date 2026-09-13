/**
 * The page as the agent's side of the system is allowed to know it: an
 * accessibility tree and a focus position. Nothing here carries a pixel, a
 * coordinate, a bounding box or raw HTML. Purity suite P-3.
 *
 * These mirror the subset of CDP's Accessibility.AXNode we keep. They are our
 * own types, not the protocol's, so a recorded snapshot is plain JSON that
 * serialize.ts can be tested against with no browser.
 */

import type { AllowedKey } from '@ally/shared';

export interface AXValue {
  type: string;
  value?: unknown;
}

export interface AXProperty {
  name: string;
  value: AXValue;
}

export interface AXNode {
  nodeId: string;
  ignored: boolean;
  role?: AXValue;
  name?: AXValue;
  value?: AXValue;
  properties?: AXProperty[];
  parentId?: string;
  childIds?: string[];
  backendDOMNodeId?: number;
}

export interface AXSnapshot {
  url: string;
  nodes: AXNode[];
}

export interface FocusInfo {
  axNodeId: string;
  backendNodeId: number | null;
  role: string;
  name: string | null;
}

/** An open browser session. Opaque: the Playwright page is never reachable from it. */
export interface DriverSession {
  readonly id: string;
}

/**
 * The five operations bound to one session. This is the whole of what the
 * agent loop receives. Purity suite P-1.
 */
export interface AgentDriver {
  axSnapshot(): Promise<AXSnapshot>;
  pressKey(key: AllowedKey): Promise<void>;
  typeText(text: string): Promise<void>;
  focusInfo(): Promise<FocusInfo | null>;
  currentUrl(): string;
}
