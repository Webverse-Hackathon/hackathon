'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

/**
 * The page as a sighted person sees it, polled from the agent's own browser.
 * These frames are for the humans watching. The agent never receives them:
 * its only input is the accessibility tree on the right.
 */
export function LiveFrame({ runId, active, host }: { runId: string; active: boolean; host: string | null }) {
  const [src, setSrc] = useState<string | null>(null);
  const seq = useRef(0);
  const current = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // After the run ends, fetch a few more times so the final frame lands.
    let trailing = active ? Infinity : 3;

    const poll = async () => {
      try {
        const response = await fetch(api.frameUrl(runId, seq.current), { cache: 'no-store' });
        if (response.status === 200) {
          const nextSeq = Number(response.headers.get('X-Frame-Seq') ?? seq.current + 1);
          const blob = await response.blob();
          // A poll cancelled mid-request (the run just finished) must not advance the
          // sequence, or the next poll asks only for newer frames and never shows this one.
          if (cancelled) return;
          seq.current = nextSeq;
          const url = URL.createObjectURL(blob);
          if (current.current) URL.revokeObjectURL(current.current);
          current.current = url;
          setSrc(url);
        }
      } catch {
        // The server may be restarting; keep trying quietly.
      }
      if (!cancelled && trailing-- > 0) timer = setTimeout(poll, 600);
    };
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [runId, active]);

  useEffect(
    () => () => {
      if (current.current) URL.revokeObjectURL(current.current);
    },
    [],
  );

  return (
    <figure className="frame">
      <figcaption className="frame-caption">
        <span className="eyebrow">What you see</span>
        <span className="frame-host">{host ?? 'Opening the browser…'}</span>
      </figcaption>
      <div className="frame-screen">
        {src ? (
          <img src={src} alt="Live view of the page the agent is operating. The agent itself never receives this image." />
        ) : (
          <div className="frame-empty">Waiting for the first frame…</div>
        )}
        <p className="frame-badge">
          <span aria-hidden="true">⊘</span> The agent cannot see this
        </p>
      </div>
    </figure>
  );
}
