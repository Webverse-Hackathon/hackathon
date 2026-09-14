'use client';

import type { RunReport, StreamEvent } from '@ally/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useReducer, useRef, useState, type Ref } from 'react';
import { api, ApiRequestError } from '@/lib/api';
import { CATEGORY_LABEL, describeAction, hostOf, WCAG_NAME } from '@/lib/labels';
import { initialState, reduce, STREAM_EVENT_NAMES, type StepView } from '@/lib/live-state';
import { useSpeech } from '@/lib/speech';
import { FixPanel } from './FixPanel';
import { LiveFrame } from './LiveFrame';
import { StatusBadge } from './StatusBadge';

const TERMINAL = new Set(['SUCCEEDED', 'BLOCKED', 'ABANDONED', 'ERRORED']);
/** Events delivered this soon after connecting are the replayed log, not live: never spoken. */
const REPLAY_WINDOW_MS = 400;
const MAX_SPOKEN_LINES = 10;
/** A full first read can be 60 lines; show the start and let the viewer expand it. */
const COLLAPSED_LINES = 12;

function spokenPerception(step: { lines: { spoken: string }[] }): string {
  const lines = step.lines.map((line) => line.spoken);
  if (lines.length <= MAX_SPOKEN_LINES) return lines.join(' ');
  return `${lines.slice(0, MAX_SPOKEN_LINES).join(' ')} … and ${lines.length - MAX_SPOKEN_LINES} more items.`;
}

function StepCard({ step, budget, itemRef }: { step: StepView; budget: number | null; itemRef?: Ref<HTMLLIElement> }) {
  const [expanded, setExpanded] = useState(false);
  const long = step.lines.length > COLLAPSED_LINES + 2;
  const shown = long && !expanded ? step.lines.slice(0, COLLAPSED_LINES) : step.lines;
  return (
    <li className="step" ref={itemRef}>
      <h3 className="step-title">
        Step {step.index}
        {budget ? <span className="muted"> of {budget}</span> : null}
      </h3>

      {step.lines.length > 0 ? (
        <div className="heard">
          <p className="eyebrow">Heard</p>
          <ul className="transcript">
            {shown.map((line, index) => (
              <li key={`${line.axNodeId}-${index}`} className={line.role === 'note' ? 'line line-note' : 'line'}>
                {line.spoken}
                {line.suspiciousName ? <span className="chip chip-warn">meaningless name</span> : null}
                {line.possibleInjection ? <span className="chip chip-bad">possible injection</span> : null}
              </li>
            ))}
          </ul>
          {long ? (
            <button type="button" className="link-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
              {expanded ? 'Show less' : `Show all ${step.lines.length} lines`}
            </button>
          ) : null}
        </div>
      ) : null}

      {step.narration ? (
        <blockquote className="narration">
          <p className="eyebrow">Agent</p>
          <p>{step.narration}</p>
        </blockquote>
      ) : null}

      {step.decision ? (
        <div className="decision">
          <p>
            <span aria-hidden="true" className="arrow">
              →
            </span>{' '}
            <strong>{describeAction(step.decision.tool, step.decision.input)}</strong>
            <span className="muted small"> · confidence {Math.round(step.decision.confidence * 100)}%</span>
          </p>
          {step.decision.reasoning ? (
            <details>
              <summary>Why</summary>
              <p>{step.decision.reasoning}</p>
            </details>
          ) : null}
        </div>
      ) : null}

      {step.result ? <p className="result">{step.result}</p> : null}
      {step.warnings.map((warning, index) => (
        <p key={index} className="chip chip-warn step-warning">
          <span aria-hidden="true">! </span>
          {warning}
        </p>
      ))}
    </li>
  );
}

export function LiveRun({ runId }: { runId: string }) {
  const router = useRouter();
  const [state, dispatch] = useReducer(reduce, runId, initialState);
  const [report, setReport] = useState<RunReport | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'fix' | 'rerun' | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const speech = useSpeech(true);
  const speakRef = useRef(speech.speak);
  speakRef.current = speech.speak;
  const latestStep = useRef<HTMLLIElement | null>(null);
  const panel = useRef<HTMLElement | null>(null);
  const liveRef = useRef(false);

  const refreshReport = useCallback(async () => {
    try {
      setReport(await api.report(runId));
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : 'The run could not be loaded.');
    }
  }, [runId]);

  useEffect(() => {
    void refreshReport();
  }, [refreshReport]);

  useEffect(() => {
    const source = new EventSource(api.streamUrl(runId));
    const connectedAt = Date.now();
    liveRef.current = false;

    const handle = (name: StreamEvent['event']) => (message: MessageEvent<string>) => {
      const event = { event: name, data: JSON.parse(message.data) } as StreamEvent;
      dispatch(event);
      const live = Date.now() - connectedAt > REPLAY_WINDOW_MS;
      if (!live) return;
      liveRef.current = true;
      const speak = speakRef.current;

      switch (event.event) {
        case 'step.perception':
          speak(spokenPerception(event.data), 'reader');
          break;
        case 'step.narration':
          speak(event.data.text, 'agent');
          break;
        case 'step.action':
          setAnnouncement(`Step ${event.data.index}: ${event.data.result}.`);
          break;
        case 'run.blocked':
          speak(`Goal abandoned at step ${event.data.atStep}. ${event.data.summary}`, 'agent');
          setAnnouncement(`Blocked at step ${event.data.atStep}: ${CATEGORY_LABEL[event.data.category]}. ${event.data.summary}`);
          break;
        case 'run.succeeded':
          speak(`Goal completed in ${event.data.stepsUsed} steps.`, 'agent');
          setAnnouncement(`Goal completed in ${event.data.stepsUsed} steps.`);
          break;
        case 'run.errored':
          setAnnouncement(`The run errored: ${event.data.message}`);
          break;
        case 'run.correlated':
          speak(event.data.verdict, 'agent');
          setAnnouncement(event.data.verdict);
          break;
        case 'fix.validated':
          setAnnouncement(event.data.passed ? 'The patch passed all five gates.' : `Patch attempt ${event.data.attempts} failed validation.`);
          break;
        case 'fix.verified':
          setAnnouncement(event.data.success ? `Verified: the goal completed in ${event.data.after} steps on the patched site.` : 'The verify run stopped at a different point.');
          break;
        case 'fix.failed':
          setAnnouncement(`The fix stopped: ${event.data.reason}`);
          break;
        default:
          break;
      }
      if (event.event === 'run.finished' || event.event === 'fix.verified' || event.event === 'fix.verifying') void refreshReport();
    };

    const listeners = STREAM_EVENT_NAMES.map((name) => [name, handle(name)] as const);
    for (const [name, listener] of listeners) source.addEventListener(name, listener as EventListener);
    return () => {
      for (const [name, listener] of listeners) source.removeEventListener(name, listener as EventListener);
      source.close();
    };
  }, [runId, refreshReport]);

  // Follow the run inside the perception panel only; never scroll the page under the viewer.
  useEffect(() => {
    const container = panel.current;
    if (!liveRef.current || !container) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ending = state.blocked || state.succeeded || state.errored;
    const target = ending ? container.scrollHeight : (latestStep.current?.offsetTop ?? container.scrollHeight) - 12;
    container.scrollTo({ top: target, behavior: reduced ? 'auto' : 'smooth' });
  }, [state.steps.length, state.blocked, state.succeeded, state.errored]);

  const status = state.finished?.status ?? (report && TERMINAL.has(report.status) ? report.status : state.status);
  const running = !TERMINAL.has(status);
  const url = state.url ?? report?.url ?? null;
  const goal = state.goal ?? report?.goal ?? null;
  const budget = state.stepBudget ?? report?.stepBudget ?? null;
  const stepsUsed = state.finished?.stepsUsed ?? Math.max(0, ...state.steps.map((step) => step.index));
  const fixable = Boolean(report?.fixable) && !state.fix;

  const startFix = async () => {
    setBusy('fix');
    setActionError(null);
    try {
      await api.fix(runId);
      setReport((current) => (current ? { ...current, fixable: false } : current));
    } catch (error) {
      setActionError(error instanceof ApiRequestError ? error.message : 'The fix could not start.');
    } finally {
      setBusy(null);
    }
  };

  const rerun = async () => {
    setBusy('rerun');
    setActionError(null);
    try {
      const created = await api.rerun(runId);
      router.push(created.liveUrl);
    } catch (error) {
      setActionError(error instanceof ApiRequestError ? error.message : 'The run could not be restarted.');
      setBusy(null);
    }
  };

  if (loadError && !state.url) {
    return (
      <div className="page-narrow">
        <h1>Run not available</h1>
        <p className="notice notice-bad" role="alert">
          {loadError}
        </p>
        <Link className="button" href="/">
          Start a new run
        </Link>
      </div>
    );
  }

  return (
    <div className="live">
      <header className="live-header">
        <div className="live-heading">
          {report?.source === 'VERIFY' && report.parentRunId ? (
            <p className="eyebrow">
              Verify run for a fix ·{' '}
              <Link href={`/live/${report.parentRunId}`}>back to the original run</Link>
            </p>
          ) : (
            <p className="eyebrow">Live run</p>
          )}
          <h1>{goal ?? 'Loading…'}</h1>
          <p className="muted">{url ? hostOf(url) : ' '}</p>
        </div>
        <div className="live-controls">
          <StatusBadge status={status} />
          {budget ? (
            <div className="counter">
              <label htmlFor="step-progress" className="small muted">
                Step {stepsUsed} of {budget}
              </label>
              <progress id="step-progress" max={budget} value={stepsUsed} />
            </div>
          ) : null}
          {speech.supported ? (
            <button type="button" className="button button-secondary" aria-pressed={speech.enabled} onClick={() => speech.setEnabled(!speech.enabled)}>
              <span aria-hidden="true">{speech.enabled ? '🔊' : '🔇'} </span>
              Speak aloud
            </button>
          ) : null}
        </div>
      </header>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <div className="split">
        <div className="split-left">
          <LiveFrame runId={runId} active={running} host={url ? hostOf(url) : null} />
          <p className="small muted frame-note">
            Frames come from the same browser the agent drives, for you only. The agent receives the accessibility tree on the right and nothing else, and it may only press keys.
          </p>
        </div>

        <section className="split-right" aria-labelledby="perceives-title" ref={panel}>
          <h2 id="perceives-title" className="eyebrow">
            What the agent perceives
          </h2>
          {state.steps.length === 0 && running ? <p className="muted">Opening the page and reading the accessibility tree…</p> : null}
          <ol className="steps">
            {state.steps.map((step, index) => (
              <StepCard key={step.index} step={step} budget={budget} itemRef={index === state.steps.length - 1 ? latestStep : undefined} />
            ))}
          </ol>

          {state.blocked ? (
            <section className="card outcome outcome-bad" aria-labelledby="outcome-title">
              <p className="eyebrow">
                <span aria-hidden="true">✕ </span>Blocked
              </p>
              <h2 id="outcome-title">
                Goal abandoned at step {state.blocked.atStep}
                {budget ? ` of ${budget}` : ''}.
              </h2>
              <p className="outcome-category">{CATEGORY_LABEL[state.blocked.category]}</p>
              <p>{state.blocked.summary}</p>
              {state.blocked.wcagCriteria.length ? (
                <p className="small muted">
                  WCAG {state.blocked.wcagCriteria.map((criterion) => `${criterion} ${WCAG_NAME[criterion] ?? ''}`.trim()).join(' · ')}
                </p>
              ) : null}
            </section>
          ) : null}
          {state.succeeded ? (
            <section className="card outcome outcome-good" aria-labelledby="outcome-title">
              <p className="eyebrow">
                <span aria-hidden="true">✓ </span>Goal completed
              </p>
              <h2 id="outcome-title">Completed in {state.succeeded.stepsUsed} steps.</h2>
              <p>{state.succeeded.evidence}</p>
            </section>
          ) : null}
          {status === 'ABANDONED' ? (
            <section className="card outcome outcome-warn" aria-labelledby="outcome-title">
              <h2 id="outcome-title">Out of steps without a conclusion.</h2>
              <p>The agent used all {budget} steps. Try a larger budget or a more specific goal.</p>
            </section>
          ) : null}
          {state.errored ? (
            <section className="card outcome outcome-warn" aria-labelledby="outcome-title" role="alert">
              <h2 id="outcome-title">The run errored.</h2>
              <p>{state.errored.message}</p>
              <p className="small muted">This is a failure of the run, not a finding about the site. Code {state.errored.code}.</p>
            </section>
          ) : null}
        </section>
      </div>

      {state.correlated ? (
        <section className="verdict" aria-labelledby="verdict-title">
          <h2 id="verdict-title" className="eyebrow">
            The comparison
          </h2>
          <p className="verdict-text">{state.correlated.verdict}</p>
          <dl className="verdict-stats">
            <div>
              <dt>axe-core violations</dt>
              <dd>{state.correlated.axeViolationCount}</dd>
            </div>
            <div>
              <dt>Caught what stopped the agent</dt>
              <dd>{state.correlated.blockerCaughtByAxe ? 'Yes' : 'No'}</dd>
            </div>
            <div>
              <dt>Steps before the wall</dt>
              <dd>{stepsUsed}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      {!running ? (
        <div className="actions">
          {fixable ? (
            <button type="button" className="button" onClick={startFix} disabled={busy !== null}>
              {busy === 'fix' ? 'Starting…' : 'Fix this'}
            </button>
          ) : null}
          <Link className="button button-secondary" href={`/run/${runId}`}>
            View full report
          </Link>
          <button type="button" className="button button-secondary" onClick={rerun} disabled={busy !== null}>
            {busy === 'rerun' ? 'Starting…' : 'Re-run'}
          </button>
          {report && !report.fixable && report.status === 'BLOCKED' && report.mode === 'URL_ONLY' ? (
            <p className="small muted">No source repository is connected to this site, so Ally reports the blocker without patching it.</p>
          ) : null}
        </div>
      ) : null}
      {actionError ? (
        <p className="notice notice-bad" role="alert">
          {actionError}
        </p>
      ) : null}

      {state.fix ? <FixPanel fix={state.fix} /> : null}
    </div>
  );
}
