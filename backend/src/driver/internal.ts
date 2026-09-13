/**
 * The privileged half of the driver. The Playwright objects live here, keyed by
 * an opaque session handle, and never leave the driver module.
 *
 * agent/ must not import this file. Enforced by eslint (P-4).
 */

import type { Browser, BrowserContext, CDPSession, Page } from 'playwright';
import type { DriverSession } from './types.js';

export interface SessionInternals {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  cdp: CDPSession;
}

const sessions = new WeakMap<DriverSession, SessionInternals>();

export function registerSession(session: DriverSession, internals: SessionInternals): void {
  sessions.set(session, internals);
}

export function internalsOf(session: DriverSession): SessionInternals {
  const internals = sessions.get(session);
  if (!internals) throw new Error(`Driver session ${session.id} is closed or unknown.`);
  return internals;
}

export function forgetSession(session: DriverSession): void {
  sessions.delete(session);
}
