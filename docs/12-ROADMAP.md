# 12 · Roadmap

Scaffolded 2026-09-11. Days are relative to the start of build, not calendar dates — fill in the
actual submission deadline at the top of `PROGRESS.md` as soon as it is known.

## The ordering principle

**The demo is the product, and the demo is one path.** Build that path end to end before you build
anything sideways. A working thin slice on day two beats a beautiful half-system on day four.

The single riskiest link is `accessibility tree → keystroke loop → a real blocker`. Everything else
is engineering you already know how to do. **Prove that link first**, on day one, in a scrappy
script with no database and no UI. If it does not work, the whole project changes shape, and you
want to know that on day one rather than day three.

---

## Day 0 — Setup (done)

- [x] Repository initialised, docs written, workspace scaffolded
- [ ] Docker Desktop installed on every machine
- [ ] `ANTHROPIC_API_KEY` in every developer's `.env`
- [ ] GitHub App created for the organisation, private key stored
- [ ] Everyone has read `CLAUDE.md`, `09-FAILURE-MODES.md` and `11-DEMO-SCRIPT.md`

---

## Day 1 — Prove the premise

**Definition of done: a terminal script prints a screen-reader transcript of a real page and an
agent gives up on a real goal, with a reason.** No database, no API, no frontend.

- [x] `driver/` — Playwright plus CDP `Accessibility.getFullAXTree`, with the five-function surface
- [x] `driver/serialize.ts` — AX tree to transcript lines, with unit tests against recorded trees
- [x] `agent/loop.ts` — the loop, the five tools, the step budget
- [x] `llm/provider.ts` — the Anthropic adapter, `narrate()` and `decide()`
- [x] A CLI: `pnpm agent --url <url> --goal "<goal>"`, printing the transcript and the outcome
- [x] `fixtures/broken-shop` — the deliberately broken storefront (the `ALLY_SOURCE=1` plugin itself is Day 3)
- [x] The purity suite (P-1 to P-5) passing
- [x] **The gate:** a live run against `broken-shop` with a real model produces a sensible blocker — 2026-09-14, OpenRouter free models via the dashboard: `BLOCKED` at step 9, `UNLABELLED_CONTROL`, verdict "14 violations, zero of them the reason"

**Stop-and-reassess trigger:** if by the end of day one the agent cannot produce a sensible blocker
on `broken-shop`, escalate immediately. Prompt problem, serialiser problem, or premise problem —
find out which before building anything on top.

---

## Day 2 — Make it a system

**Definition of done: submit a URL and a goal in the browser and watch the narration stream in,
spoken aloud, ending in a blocker card.** This is the demo's spine.

> **Demo build (DECISIONS.md #13):** the items ticked below are done in a single in-memory process. The
> Prisma, Redis and BullMQ items are deliberately deferred, not forgotten.

- [ ] Prisma schema, migrations, Postgres and Redis in compose — deferred (#13)
- [x] Fastify API: `POST /runs`, `GET /runs/:id`, `GET /runs/:id/stream` (plus frame, fix, rerun, config)
- [ ] BullMQ worker wrapping the day-one loop, publishing step events to Redis — in-process queue instead (#13)
- [x] Next.js: landing form and `/live/[runId]` split screen (left panel: frames from the agent's browser)
- [x] Web Speech API narration, two voices, with a toggle
- [x] axe-core baseline at both phases (findings keyed by selector, not `backendNodeId`)
- [x] `correlate()` and the verdict sentence
- [x] `/run/[runId]` report page, server rendered

**If you are behind at the end of day 2, cut the report page before you cut the live view.** The
live view is the demo.

---

## Day 3 — Close the loop

**Definition of done: click Fix, a real pull request opens on a real repository, the verify run
succeeds, and the pull request gets a comment.**

- [ ] The Babel or SWC plugin stamping `data-ally-src`, wired into the fixture — cut; AST search instead
- [x] `sourcemap/` — AST search only, with the confidence gate (the planned fallback)
- [x] `patch/generate.ts` and the five validation gates
- [ ] `github/` — branch, commit, pull request and body are built with a token; not yet run against a real repo, no App auth
- [x] The verify re-run, and the pull request comment (comment untested without a repo)
- [x] `fix.*` events on the stream, and the progress strip in the UI
- [x] `fixtures/fixed-shop` — the patched copy the verify run targets, not a hand-fixed after-state

**This is the day most likely to overrun.** The source mapper is the part that bites. If it is not
working by mid-afternoon, fall back to the deterministic attribute only and drop the fiber and AST
strategies to day 5. A demo that maps one element perfectly beats three strategies that half work.

---

## Day 4 — Harden, then Barrier Report

**Do the hardening first. Barrier Report only if the core is green.**

Morning — hardening:
- [ ] `ALLY_REPLAY` record and replay, verified with the network off (F-12, F-50)
- [ ] The golden fixture suite, all twelve sites, with expected categories
- [ ] SSRF guard, all eleven URL cases (F-01)
- [ ] Prompt-injection handling and the `injection` fixture (F-14)
- [x] Success confirmation and the downgrade path (F-13) — done early, in Phase 1
- [x] Narration vocabulary guard (F-18) — done early, in Phase 1
- [ ] Orphan-run sweeper and the heartbeat (F-24)
- [ ] The dogfood suite: Ally against our own dashboard, zero axe violations

Afternoon — Barrier Report, if and only if the above is green:
- [ ] `/barrier` page, keyboard-first and screen-reader-first by construction
- [ ] `POST /barriers` with the two-phase confirm flow
- [ ] Speech input with a text fallback
- [ ] The three outcomes, including the careful not-reproduced wording (F-43)
- [ ] Report credit in the pull request body

---

## Day 5 — Deploy, rehearse, polish

- [ ] Deploy Path A: one EC2 instance, docker compose, Caddy, an elastic IP
- [ ] Pin the fixture image digest and tag `demo-frozen`
- [ ] CI workflows green: `ci.yml` and `dogfood.yml`
- [ ] `ally.yml` example workflow written, for the impact story
- [ ] Record the fallback video
- [ ] **Full demo rehearsal, three times.** Once cold, once on venue wifi, once in replay mode
- [ ] Preflight checklist executed and any gap closed
- [ ] Slides: three numbers, the gap, the architecture in one diagram, the market

**Feature freeze at the start of day 5.** Nothing new after that, only fixes. A feature added on the
morning of a demo is the feature that breaks during it.

---

## Cut list, in the order things get cut

Decide this now, while it is cheap, so nobody has to argue at 2 a.m.

| Priority | Feature | Cut when |
|---|---|---|
| Never cut | The agent loop, the transcript, the live narration, the blocker | — |
| Never cut | The axe correlation and the verdict | — |
| High | The fix flow and the pull request | Only if day 3 completely collapses; then show a hand-written diff and say so |
| High | The verify re-run | Only with the fix flow |
| Medium | Barrier Report | If day 4 morning is not green. **Stays in the deck regardless.** |
| Medium | The report page | If day 2 overruns. The live view carries the demo. |
| Low | Run history at `/runs` | Freely |
| Low | The fiber and AST source strategies | Freely, keep the attribute |
| Low | Path B on AWS ECS | Freely. Present it as architecture. |
| Low | GitHub webhook and pull request state sync | Freely |

## Stretch, only if genuinely ahead

- Ally running against Ally, nightly, with the result on the landing page
- A trend chart across runs for a repository, which is the compliance-owner story
- A VS Code extension showing the blocker inline at the source line
- Multiple assistive-technology profiles: screen reader, keyboard only, switch access
- A public gallery of real sites audited, which is excellent marketing and a moderation problem

## How to use this file in a new session

1. Read `PROGRESS.md` first — it says which day we are actually on.
2. Read the unchecked boxes for that day here.
3. Read `09-FAILURE-MODES.md` for anything relevant to what you are about to build.
4. Build, test, tick the box, update `PROGRESS.md`.
