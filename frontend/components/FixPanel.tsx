'use client';

import Link from 'next/link';
import { FIX_STAGES, GATE_LABEL } from '@/lib/labels';
import type { FixView, StageStatus } from '@/lib/live-state';
import { DiffView } from './DiffView';

const STAGE_ICON: Record<StageStatus, string> = { pending: '○', running: '◔', done: '✓', failed: '✕', skipped: '–' };
const STAGE_WORD: Record<StageStatus, string> = { pending: 'waiting', running: 'in progress', done: 'done', failed: 'failed', skipped: 'skipped' };

export function FixPanel({ fix }: { fix: FixView }) {
  const skippedPr = fix.stages.pr.status === 'skipped';
  return (
    <section className="card fix" aria-labelledby="fix-title">
      <h2 id="fix-title">THE AUTOMATED FIX</h2>

      <ol className="stages">
        {FIX_STAGES.map(({ stage, label }) => {
          const { status } = fix.stages[stage];
          return (
            <li key={stage} className={`stage stage-${status}`}>
              <span aria-hidden="true" className={status === 'running' ? 'stage-icon spin' : 'stage-icon'}>
                {STAGE_ICON[status]}
              </span>
              <span>
                {label} <span className="sr-only">: {STAGE_WORD[status]}</span>
              </span>
            </li>
          );
        })}
      </ol>

      {fix.located ? (
        <p className="fix-located">
          Mapped the blocking element to{' '}
          <code>
            {fix.located.filePath}:{fix.located.lineStart}
            {fix.located.lineEnd !== fix.located.lineStart ? `–${fix.located.lineEnd}` : ''}
          </code>{' '}
          by {fix.located.locateMethod.replace('-', ' ')}, confidence {Math.round(fix.located.locateConfidence * 100)}%.
        </p>
      ) : null}

      {fix.diff ? (
        <>
          {fix.rationale ? <p className="fix-rationale">{fix.rationale}</p> : null}
          <DiffView diff={fix.diff} label={`Patch, ${fix.linesChanged ?? 0} lines changed`} />
        </>
      ) : null}

      {fix.gates ? (
        <ul className="gates" aria-label={`Validation gates, attempt ${fix.attempts ?? 1}`}>
          {Object.entries(fix.gates).map(([gate, ok]) => (
            <li key={gate} className={ok ? 'gate gate-ok' : 'gate gate-bad'}>
              <span aria-hidden="true">{ok ? '✓' : '✕'}</span> {GATE_LABEL[gate] ?? gate}
              <span className="sr-only">{ok ? ' passed' : ' failed'}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {fix.pullRequest ? (
        <p className="fix-pr">
          <a href={fix.pullRequest.url} target="_blank" rel="noreferrer">
            Pull request #{fix.pullRequest.number} on {fix.pullRequest.owner}/{fix.pullRequest.repo}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </p>
      ) : skippedPr ? (
        <p className="muted small">{fix.stages.pr.detail}</p>
      ) : fix.stages.pr.status === 'failed' ? (
        <p className="notice notice-warn">{fix.stages.pr.detail}</p>
      ) : null}

      {fix.verifyRunId ? (
        <p>
          <Link className="button button-secondary" href={`/live/${fix.verifyRunId}`}>
            Watch the verify run
          </Link>
        </p>
      ) : null}

      {fix.verified ? (
        fix.verified.success ? (
          <p className="notice notice-good">
            <span aria-hidden="true">✓ </span>
            Verified. The same agent, with the same constraint, completed the goal in {fix.verified.after} steps against the patched site.
          </p>
        ) : (
          <p className="notice notice-warn">
            <span aria-hidden="true">◐ </span>
            This patch removed one wall. The re-run stopped at a different point, which is the next thing to fix: open the verify run.
          </p>
        )
      ) : null}

      {fix.failure ? (
        <div className="notice notice-bad" role="alert">
          <strong>The fix stopped at “{fix.failure.stage}”.</strong> {fix.failure.reason}
          {fix.failure.suggestedDiff && !fix.diff ? <DiffView diff={fix.failure.suggestedDiff} label="Suggested, unvalidated diff" /> : null}
        </div>
      ) : null}
    </section>
  );
}
