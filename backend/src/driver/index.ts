/**
 * THE TRUST BOUNDARY. This module exports exactly five functions and nothing
 * else at runtime: axSnapshot, pressKey, typeText, focusInfo, currentUrl.
 * Purity suite P-1 fails if a sixth appears.
 *
 * None of them returns pixels, coordinates, bounding boxes or HTML. There is no
 * screenshot, no click, no goto and no evaluate here, and there never will be.
 * See docs/06-AGENT-LOOP.md.
 */

import { getFullAXTree } from './cdp.js';
import { internalsOf } from './internal.js';
import { assertAllowedKey, assertTypeableText, playwrightKey } from './keys.js';
import { stableTree } from './stabilize.js';
import { focusedNode, nameOf, roleOf } from './tree.js';
import type { AXSnapshot, DriverSession, FocusInfo } from './types.js';

export type { AgentDriver, AXNode, AXProperty, AXSnapshot, AXValue, DriverSession, FocusInfo } from './types.js';

/** Settle time after a keystroke, so a navigation it triggers has started before we read. */
const AFTER_KEY_MS = 150;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function axSnapshot(session: DriverSession): Promise<AXSnapshot> {
  const { page, cdp } = internalsOf(session);
  const nodes = await stableTree(page, cdp);
  return { url: page.url(), nodes };
}

export async function pressKey(session: DriverSession, key: string): Promise<void> {
  // Validate before touching the session, so a bad key never reaches Playwright. P-5.
  assertAllowedKey(key);
  const { page } = internalsOf(session);
  await page.keyboard.press(playwrightKey(key));
  await sleep(AFTER_KEY_MS);
}

export async function typeText(session: DriverSession, text: string): Promise<void> {
  assertTypeableText(text);
  const { page } = internalsOf(session);
  await page.keyboard.type(text);
  await sleep(AFTER_KEY_MS);
}

export async function focusInfo(session: DriverSession): Promise<FocusInfo | null> {
  const { cdp } = internalsOf(session);
  const focused = focusedNode(await getFullAXTree(cdp));
  if (!focused) return null;
  return {
    axNodeId: focused.nodeId,
    backendNodeId: focused.backendDOMNodeId ?? null,
    role: roleOf(focused) || 'unknown',
    name: nameOf(focused) || null,
  };
}

export function currentUrl(session: DriverSession): string {
  return internalsOf(session).page.url();
}
