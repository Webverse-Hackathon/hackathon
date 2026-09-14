import Link from 'next/link';
import { RunForm } from '@/components/RunForm';
import { StatusBadge } from '@/components/StatusBadge';
import { api } from '@/lib/api';
import { formatDuration, hostOf } from '@/lib/labels';

export const dynamic = 'force-dynamic';

async function recentRuns() {
  try {
    return (await api.runs()).runs.slice(0, 6);
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const runs = await recentRuns();

  return (
    <div className="home">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">Accessibility testing that uses the site</p>
          <h1 id="hero-title">
            Every tool asks whether a page breaks a rule. <span className="accent">Ally asks whether a blind person can finish the task.</span>
          </h1>
          <p className="lede">
            Give Ally a website and a goal. It opens the page in a real browser, then takes the screen away: it gets only the accessibility tree a screen reader speaks, and it may only press keys. It tells you the exact step where it gave up, finds the line of code responsible, and writes the fix.
          </p>
          <ul className="facts">
            <li>
              <strong>No pixels.</strong> The agent never receives a screenshot or a coordinate. A test enforces it.
            </li>
            <li>
              <strong>A real blocker, not a rule.</strong> The finding is where the task failed.
            </li>
            <li>
              <strong>Proof, not a claim.</strong> Every fix is re-run with the same goal.
            </li>
          </ul>
        </div>
        <RunForm />
      </section>

      <section id="how" className="how" aria-labelledby="how-title" tabIndex={-1}>
        <h2 id="how-title">How it works</h2>
        <ol className="how-steps">
          <li>
            <h3>Perceive</h3>
            <p>Chromium’s accessibility tree is turned into the lines a screen reader would speak, and nothing else.</p>
          </li>
          <li>
            <h3>Decide and act</h3>
            <p>A model chooses one keystroke at a time toward the goal, and explains why. Loops and false success are caught.</p>
          </li>
          <li>
            <h3>Compare</h3>
            <p>axe-core scans the same page. Ally shows which of its violations actually stopped the task. Usually none.</p>
          </li>
          <li>
            <h3>Fix and verify</h3>
            <p>The blocking element is traced to its JSX, patched, checked by five gates, and the goal is run again.</p>
          </li>
        </ol>

        <div className="gap">
          <div className="gap-col">
            <h3>A rule checker sees</h3>
            <ul>
              <li>An image with alt text “image_04.png”: passes</li>
              <li>A clickable div with no name: not reported</li>
              <li>A dialog that never receives focus: not reported</li>
            </ul>
          </div>
          <div className="gap-col gap-col-ally">
            <h3>Ally hears</h3>
            <ul>
              <li>“image. image. Blue linen shirt. $48.00.”</li>
              <li>No control that adds anything to the cart</li>
              <li>“Goal abandoned at step 7: unlabelled control.”</li>
            </ul>
          </div>
        </div>
      </section>

      {runs.length > 0 ? (
        <section className="recent" aria-labelledby="recent-title">
          <h2 id="recent-title">Recent runs</h2>
          <ul className="run-list">
            {runs.map((run) => (
              <li key={run.id}>
                <Link href={run.status === 'RUNNING' || run.status === 'QUEUED' ? `/live/${run.id}` : `/run/${run.id}`} className="run-row">
                  <span className="run-goal">{run.goal}</span>
                  <span className="muted small">{hostOf(run.url)}</span>
                  <span className="small">
                    {run.stepsUsed} of {run.stepBudget} steps · {formatDuration(run.durationMs)}
                  </span>
                  <StatusBadge status={run.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
