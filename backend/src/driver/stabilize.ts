/**
 * Stabilisation before each snapshot (F-05, docs/06 determinism point 3): wait
 * for the network to go quiet, then require two consecutive identical trees
 * 250 ms apart, capped at two seconds. Do not "fix" flakiness by raising these
 * numbers; that makes the demo slow without making it stable.
 */

import type { Page, CDPSession } from 'playwright';
import { getFullAXTree } from './cdp.js';
import { normalisedTreeText } from './hash.js';
import type { AXNode } from './types.js';

const NETWORK_IDLE_TIMEOUT_MS = 1500;
const POLL_INTERVAL_MS = 250;
const STABILISE_CAP_MS = 2000;
const TREE_READ_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A tree read can race a navigation; retry a few times before giving up. */
async function readTree(page: Page, cdp: CDPSession): Promise<AXNode[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < TREE_READ_ATTEMPTS; attempt++) {
    try {
      await page.waitForLoadState('domcontentloaded');
      return await getFullAXTree(cdp);
    } catch (error) {
      lastError = error;
      await sleep(POLL_INTERVAL_MS);
    }
  }
  throw lastError;
}

export async function stableTree(page: Page, cdp: CDPSession): Promise<AXNode[]> {
  await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {
    // A page that polls forever never goes idle. Fall through to tree comparison.
  });

  const started = Date.now();
  let previous = await readTree(page, cdp);
  while (Date.now() - started < STABILISE_CAP_MS) {
    await sleep(POLL_INTERVAL_MS);
    const current = await readTree(page, cdp);
    const url = page.url();
    if (normalisedTreeText({ url, nodes: current }) === normalisedTreeText({ url, nodes: previous })) {
      return current;
    }
    previous = current;
  }
  return previous;
}
