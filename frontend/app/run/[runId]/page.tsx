import type { AxeFindingInfo } from '@ally/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { DiffView } from '@/components/DiffView';
import { StatusBadge } from '@/components/StatusBadge';
import { api, ApiRequestError } from '@/lib/api';
import { CATEGORY_LABEL, describeAction, formatDuration, GATE_LABEL, hostOf, WCAG_NAME } from '@/lib/labels';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Run report · Ally' };

function groupByRule(findings: AxeFindingInfo[]) {
  const groups = new Map<string, { ruleId: string; description: string; impact: string | null; count: number; related: boolean }>();
  for (const finding of findings) {
    const group = groups.get(finding.ruleId) ?? { ruleId: finding.ruleId, description: finding.description, impact: finding.impact, count: 0, related: false };
    group.count++;
    group.related ||= finding.relatedToBlocker;
    groups.set(finding.ruleId, group);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

export default async function ReportPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  let report;
  try {
    report = await api.report(runId);
  } catch (error) {
    return (
      <div className="page-narrow">
        <h1>Report not available</h1>
        <p className="notice notice-bad" role="alert">
          {error instanceof ApiRequestError ? error.message : 'The report could not be loaded.'}
        </p>
        <Link className="button" href="/">
          Start a new run
        </Link>
      </div>
    );
  }

  const rules = groupByRule(report.axeFindings);
  const { blocker } = report;

  return (
    <article className="report">
      <header className="report-header">
        <p className="eyebrow">
          Run report · <Link href={`/live/${report.id}`}>open the live view</Link>
        </p>
        <h1>{report.goal}</h1>
        <p className="muted">{hostOf(report.url)}</p>
        <dl className="report-meta">
          <div>
            <dt>Outcome</dt>
            <dd>
              <StatusBadge status={report.status} />
            </dd>
          </div>
          <div>
            <dt>Steps</dt>
            <dd>
              {report.stepsUsed} of {report.stepBudget}
            </dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{formatDuration(report.durationMs)}</dd>
          </div>
          <div>
            <dt>Model cost</dt>
            <dd>{Number(report.cost.usd) > 0 ? `$${Number(report.cost.usd).toFixed(4)}` : '—'}</dd>
          </div>
        </dl>
      </header>

      {report.verdict ? (
        <section className="verdict" aria-labelledby="verdict-title">
          <h2 id="verdict-title" className="eyebrow">
            The verdict
          </h2>
          <p className="verdict-text">{report.verdict}</p>
        </section>
      ) : report.status === 'ERRORED' ? (
        <p className="notice notice-warn">The run errored, so no comparison was made: {report.errorMessage}</p>
      ) : null}

      <div className="columns">
        <section className="card" aria-labelledby="axe-title">
          <h2 id="axe-title">What axe-core found</h2>
          {report.axeViolationCount === null ? (
            <p className="muted">No axe scan is available for this run.</p>
          ) : (
            <>
              <p className="big-number">
                {report.axeViolationCount} <span className="small muted">violations</span>
              </p>
              <ul className="rule-list">
                {rules.map((rule) => (
                  <li key={rule.ruleId} className={rule.related ? 'rule rule-related' : 'rule'}>
                    <span>
                      <code>{rule.ruleId}</code> ×{rule.count}
                    </span>
                    <span className="small muted">{rule.description}</span>
                    {rule.related ? (
                      <span className="chip chip-bad">
                        <span aria-hidden="true">★ </span>related to the blocker
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="card" aria-labelledby="blocker-title">
          <h2 id="blocker-title">What actually stopped the agent</h2>
          {blocker ? (
            <>
              <p className="outcome-category">
                <span aria-hidden="true">✕ </span>
                {CATEGORY_LABEL[blocker.category]} at step {blocker.atStep}
              </p>
              <p>{blocker.summary}</p>
              <blockquote className="narration">
                <p className="eyebrow">The agent’s reasoning</p>
                <p>{blocker.agentReasoning}</p>
              </blockquote>
              <dl className="facts-list">
                <div>
                  <dt>Role</dt>
                  <dd>{blocker.role ?? 'none exposed'}</dd>
                </div>
                <div>
                  <dt>Accessible name</dt>
                  <dd>{blocker.accessibleName ?? <strong>none</strong>}</dd>
                </div>
                {blocker.domPath ? (
                  <div>
                    <dt>DOM path</dt>
                    <dd>
                      <code>{blocker.domPath}</code>
                    </dd>
                  </div>
                ) : null}
                {blocker.source ? (
                  <div>
                    <dt>Source</dt>
                    <dd>
                      <code>
                        {blocker.source.filePath}:{blocker.source.lineStart}
                      </code>{' '}
                      <span className="small muted">({Math.round(blocker.source.locateConfidence * 100)}% by {blocker.source.locateMethod})</span>
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt>WCAG</dt>
                  <dd>{blocker.wcagCriteria.map((criterion) => `${criterion} ${WCAG_NAME[criterion] ?? ''}`.trim()).join(' · ') || '—'}</dd>
                </div>
              </dl>
              {blocker.htmlSnippet ? (
                <pre className="snippet">
                  <code>{blocker.htmlSnippet}</code>
                </pre>
              ) : null}
            </>
          ) : report.status === 'SUCCEEDED' ? (
            <p>
              <span aria-hidden="true">✓ </span>Nothing. The goal was completed.
            </p>
          ) : (
            <p className="muted">No blocker was recorded.</p>
          )}
        </section>
      </div>

      {report.patch ? (
        <section className="card" aria-labelledby="patch-title">
          <h2 id="patch-title">{report.patch.validated ? 'The fix' : 'Suggested diff (not validated)'}</h2>
          <p>{report.patch.rationale}</p>
          <DiffView diff={report.patch.diff} label={`Patch for ${report.patch.filePath}`} />
          <ul className="gates" aria-label="Validation gates">
            {Object.entries(report.patch.gateResults).map(([gate, ok]) => (
              <li key={gate} className={ok ? 'gate gate-ok' : 'gate gate-bad'}>
                <span aria-hidden="true">{ok ? '✓' : '✕'}</span> {GATE_LABEL[gate] ?? gate}
                <span className="sr-only">{ok ? ' passed' : ' failed'}</span>
              </li>
            ))}
          </ul>
          {report.pullRequest ? (
            <p>
              <a href={report.pullRequest.url} target="_blank" rel="noreferrer">
                Pull request #{report.pullRequest.number}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              {report.pullRequest.verified ? ' · verified' : ''}
            </p>
          ) : null}
          {report.verifyRun ? (
            <p>
              Verify run: <StatusBadge status={report.verifyRun.status} /> in {report.verifyRun.stepsUsed} steps ·{' '}
              <Link href={`/run/${report.verifyRun.id}`}>its report</Link>
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="card" aria-labelledby="timeline-title">
        <h2 id="timeline-title">Timeline</h2>
        <ol className="timeline">
          {report.steps.map((step, index) => (
            <li key={`${step.index}-${index}`}>
              <details>
                <summary>
                  <span className="timeline-index">Step {step.index}</span>{' '}
                  {step.toolName ? describeAction(step.toolName, step.toolInput) : step.kind === 'SYSTEM' ? 'Stopped by a safeguard' : 'Perceived'}
                  {step.actionResult ? <span className="muted"> — {step.actionResult}</span> : null}
                </summary>
                {step.narration ? <p className="narration-inline">“{step.narration}”</p> : null}
                {step.reasoning ? (
                  <p className="small">
                    <strong>Why:</strong> {step.reasoning}
                  </p>
                ) : null}
                {step.transcript?.length ? (
                  <ul className="transcript">
                    {step.transcript.map((line, lineIndex) => (
                      <li key={lineIndex} className="line">
                        {line.spoken}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </details>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
