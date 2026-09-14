/**
 * Frames of the agent's browser for the LEFT panel of the dashboard: what a
 * sighted person would see while the agent works.
 *
 * These pixels go to the dashboard over their own endpoint and nowhere else.
 * agent/ can never import this module (eslint, purity suite P-4), and nothing
 * here touches a prompt.
 */

import { internalsOf } from '../driver/internal.js';
import type { DriverSession } from '../driver/types.js';

export interface FrameSink {
  (jpeg: Buffer): void;
}

export async function captureFrame(session: DriverSession): Promise<Buffer | null> {
  try {
    const { page } = internalsOf(session);
    return await page.screenshot({ type: 'jpeg', quality: 62, caret: 'initial', timeout: 3000 });
  } catch {
    // A frame is presentation only. A failed capture never affects the run.
    return null;
  }
}

/** Captures a frame every `intervalMs` until stopped, never overlapping two captures. */
export function startFrameLoop(session: DriverSession, sink: FrameSink, intervalMs = 700): () => Promise<void> {
  let stopped = false;
  let inFlight: Promise<void> = Promise.resolve();

  const tick = () => {
    if (stopped) return;
    inFlight = captureFrame(session).then((jpeg) => {
      if (jpeg && !stopped) sink(jpeg);
      if (!stopped) timer = setTimeout(tick, intervalMs);
    });
  };
  let timer: NodeJS.Timeout = setTimeout(tick, 0);

  return async () => {
    stopped = true;
    clearTimeout(timer);
    await inFlight;
  };
}
