/**
 * Opening and closing a browser session. Used by the CLI and the worker, never
 * by agent/ (eslint enforces it): the agent receives an AgentDriver that is
 * already bound to an open session and cannot navigate anywhere itself.
 */

import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { enableDomains } from './cdp.js';
import { axSnapshot, currentUrl, focusInfo, pressKey, typeText } from './index.js';
import { forgetSession, internalsOf, registerSession } from './internal.js';
import type { AgentDriver, DriverSession } from './types.js';

export interface OpenSessionOptions {
  headless?: boolean;
  navigationTimeoutMs?: number;
}

export async function openSession(url: string, options: OpenSessionOptions = {}): Promise<DriverSession> {
  const browser = await chromium.launch({
    headless: options.headless ?? true,
    // Chromium crashes on small /dev/shm inside containers. F-61.
    args: ['--disable-dev-shm-usage'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(options.navigationTimeoutMs ?? 30_000);
    const cdp = await context.newCDPSession(page);
    await enableDomains(cdp);
    await page.goto(url, { waitUntil: 'load' });

    const session: DriverSession = Object.freeze({ id: randomUUID() });
    registerSession(session, { browser, context, page, cdp });
    return session;
  } catch (error) {
    await browser.close();
    throw error;
  }
}

export async function closeSession(session: DriverSession): Promise<void> {
  const { browser } = internalsOf(session);
  forgetSession(session);
  await browser.close();
}

/** The five operations bound to one session: everything the agent loop gets. */
export function bindAgentDriver(session: DriverSession): AgentDriver {
  return {
    axSnapshot: () => axSnapshot(session),
    pressKey: (key) => pressKey(session, key),
    typeText: (text) => typeText(session, text),
    focusInfo: () => focusInfo(session),
    currentUrl: () => currentUrl(session),
  };
}
