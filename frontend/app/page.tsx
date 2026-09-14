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
      {/* ─── Hero Section with Dot Grid & Tactile Stickers ───────────────── */}
      <section className="hero-wrapper pattern-dots" aria-labelledby="hero-title">
        {/* Floating Decorative Shapes */}
        <div className="hero-shapes" aria-hidden="true">
          <div className="shape-square-red" />
          <div className="shape-circle-yellow" />
          <div className="shape-star-badge">★ SCREEN READER ONLY</div>
        </div>

        {/* Sticker Headlines (Images 1 & 2) */}
        <div className="headline-stickers">
          <span className="eyebrow" style={{ backgroundColor: '#FFD93D', padding: '0.2rem 0.6rem', border: '2px solid #000', boxShadow: '2px 2px 0px 0px #000' }}>
            ACCESSIBILITY TESTING THAT DRIVES THE SITE
          </span>
          <div className="sticker-box-white">
            CAN A BLIND PERSON
          </div>
          <div className="sticker-box-yellow" id="hero-title">
            FINISH THE TASK?
          </div>
        </div>

        {/* Hero Content Split (Images 1 & 2) */}
        <div className="hero-content-split">
          <div className="hero-copy-column">
            {/* Split Intro Cards (Image 2) */}
            <div className="hero-intro-cards">
              <div className="card-intro-left">
                <p>
                  Every accessibility tool asks whether a page breaks a rule. <strong>Ally</strong> drives your site with only the accessibility tree and keyboard to expose the exact step where a blind user gives up.
                </p>
                <div className="card-intro-buttons">
                  <a href="#test" className="button">
                    START TESTING
                  </a>
                  <a href="#how" className="button button-secondary">
                    HOW IT WORKS →
                  </a>
                </div>
              </div>

              <div className="card-intro-right">
                <div className="badge-pin-star" aria-hidden="true">★ #1</div>
                <div className="watermark-hash" aria-hidden="true">A11Y</div>
                <div className="sticker-group-hero">
                  <span className="sticker-pill-black">NO</span>
                  <span className="sticker-pill-red">PIXELS</span>
                </div>
                <p className="card-intro-right-subtext">
                  0 SCREENSHOTS · KEYBOARD ONLY · REAL ACCESSIBILITY TREE
                </p>
              </div>
            </div>

            <ul className="facts">
              <li>
                <strong>NO PIXELS</strong>
                The agent is denied screenshots, coordinates, and bounding boxes. A strict purity test blocks CI if broken.
              </li>
              <li>
                <strong>REAL BLOCKERS</strong>
                Reports where the task actually failed, rather than generating noise over harmless syntax errors.
              </li>
              <li>
                <strong>PROOF, NOT CLAIMS</strong>
                Automatically maps the blocker to the JSX line, creates a patch, passes five gates, and re-runs the goal.
              </li>
            </ul>
          </div>

          {/* Run Form */}
          <div id="test">
            <RunForm />
          </div>
        </div>
      </section>

      {/* ─── Full-Width Black Stats Band (Image 2 Bottom) ────────────────── */}
      <section className="stats-band" aria-label="Global Accessibility Statistics">
        <div className="stats-container">
          <div className="stat-item">
            <div className="stat-label">FAIL AUTOMATED CHECKS</div>
            <div className="stat-number">95.9%</div>
            <div className="stat-bar" />
          </div>
          <div className="stat-item">
            <div className="stat-label">AVG ERRORS PER PAGE</div>
            <div className="stat-number">56.1</div>
            <div className="stat-bar" />
          </div>
          <div className="stat-item">
            <div className="stat-label">LOCKED OUT OF SOFTWARE</div>
            <div className="stat-number">1.3B</div>
            <div className="stat-bar" />
          </div>
          <div className="stat-item">
            <div className="stat-label">VISION / SCREENSHOTS</div>
            <div className="stat-number">0 PX</div>
            <div className="stat-bar" />
          </div>
        </div>
      </section>

      {/* ─── "How It Works" Section (Images 3 & 4) ───────────────────────── */}
      <section id="how" className="how-section" aria-labelledby="how-title" tabIndex={-1}>
        <span className="section-header-badge">HOW IT WORKS</span>
        <h2 id="how-title" className="section-title">TESTING WITHOUT COMPROMISE</h2>
        <p className="section-subtitle">
          Traditional linters check syntax. Ally simulates genuine assistive technology navigation to discover what stops humans from using your software.
        </p>

        <ol className="how-steps">
          <li className="how-step-card">
            <div className="how-step-header">
              <span className="how-step-num">01</span>
              <span className="badge badge-neutral">INPUT</span>
            </div>
            <div>
              <h3>PERCEIVE</h3>
              <p>Chromium’s accessibility tree is converted into the spoken lines a screen reader vocalizes — no vision, no coordinates.</p>
            </div>
          </li>

          <li className="how-step-card">
            <div className="how-step-header">
              <span className="how-step-num">02</span>
              <span className="badge badge-progress">DECIDE</span>
            </div>
            <div>
              <h3>DECIDE & ACT</h3>
              <p>A specialized LLM agent chooses one keyboard action at a time toward the user goal. Infinite loops and fake progress are caught immediately.</p>
            </div>
          </li>

          <li className="how-step-card">
            <div className="how-step-header">
              <span className="how-step-num">03</span>
              <span className="badge badge-bad">COMPARE</span>
            </div>
            <div>
              <h3>COMPARE</h3>
              <p>axe-core runs concurrently as a baseline. Ally highlights which violations actually blocked the user — usually none of them.</p>
            </div>
          </li>

          <li className="how-step-card">
            <div className="how-step-header">
              <span className="how-step-num">04</span>
              <span className="badge badge-good">RESOLVE</span>
            </div>
            <div>
              <h3>FIX & VERIFY</h3>
              <p>The blocking element is traced straight to its JSX file and line, patched, validated across five gates, and re-tested automatically.</p>
            </div>
          </li>
        </ol>
      </section>

      {/* ─── "The Gap" Section (Image 5) ─────────────────────────────────── */}
      <section id="gap" className="gap-section-wrapper" aria-labelledby="gap-title" tabIndex={-1}>
        <div className="gap-watermark" aria-hidden="true">THE GAP</div>
        <div className="gap-container">
          <span className="section-header-badge" style={{ backgroundColor: '#FFFFFF' }}>
            AUDIT VS REALITY
          </span>
          <h2 id="gap-title" className="section-title" style={{ marginBottom: '2rem' }}>
            THE ACCESSIBILITY ILLUSION
          </h2>

          <div className="gap-split-card">
            <div className="gap-col-left">
              <h3>A RULE CHECKER SEES</h3>
              <ul>
                <li>
                  <strong>PASS:</strong> An image with alt text “image_04.png” passes automated inspection.
                </li>
                <li>
                  <strong>IGNORED:</strong> A clickable &lt;div&gt; with no accessible name is not flagged.
                </li>
                <li>
                  <strong>IGNORED:</strong> A checkout modal dialog that never announces or traps keyboard focus.
                </li>
              </ul>
            </div>

            <div className="gap-col-right">
              <div className="gap-col-right-badge">RAW REALITY</div>
              <h3>ALLY HEARS & FINDS</h3>
              <ul>
                <li>
                  <strong>HEARD:</strong> “image. image. Blue linen shirt. $48.00.”
                </li>
                <li>
                  <strong>STOPPED:</strong> No keyboard-operable control exists to add the shirt to the cart.
                </li>
                <li>
                  <strong>VERDICT:</strong> “Goal abandoned at step 7: unlabelled control stops checkout.”
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Recent Runs Section ─────────────────────────────────────────── */}
      {runs.length > 0 ? (
        <section id="recent" className="recent-section" aria-labelledby="recent-title">
          <span className="section-header-badge">ACTIVITY</span>
          <h2 id="recent-title" className="section-title">RECENT RUNS</h2>
          <ul className="run-list">
            {runs.map((run) => (
              <li key={run.id}>
                <Link
                  href={run.status === 'RUNNING' || run.status === 'QUEUED' ? `/live/${run.id}` : `/run/${run.id}`}
                  className="run-row"
                >
                  <span className="run-goal">{run.goal}</span>
                  <span className="small muted">
                    <code>{hostOf(run.url)}</code>
                  </span>
                  <span className="small">
                    <strong>{run.stepsUsed}</strong> of <strong>{run.stepBudget}</strong> steps · {formatDuration(run.durationMs)}
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
