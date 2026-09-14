# PROGRESS

**The single source of truth for where this project actually is.** Update it before you stop
working, every time, even mid-task. Especially mid-task.

---

## Header — keep this current

| | |
|---|---|
| **Submission deadline** | 15 Sept, 2026 |
| **Current day** | Demo build (Days 2–3 compressed, DECISIONS.md #13); demo is 2026-09-15 |
| **Demo status** | First real-model run passed the gate: BLOCKED at step 9, UNLABELLED_CONTROL, honest verdict. Slow (5.4 min) on free endpoints; Fix not yet run with a real model |
| **Blocking issue** | Kimi K3 on NIM timed out. `.env` now points at Bynara (DECISIONS.md #17): paste the `sk-nry-` key into `ALLY_OPENAI_COMPAT_API_KEY`, probe with `pnpm agent`, then restart `pnpm demo` |
| **Last updated** | 2026-09-15 by the model switch session |

## Milestone board

| Milestone | Definition of done | Status |
|---|---|---|
| M0 Setup | Repo, docs, workspace, tooling on every machine | 🟢 done on the primary machine (solo for now); GitHub App deferred to Day 3 |
| M1 Premise proven | CLI prints a transcript and a real blocker on `broken-shop` | 🟢 real model (OpenRouter free) blocked at step 9 with `UNLABELLED_CONTROL`, from the dashboard |
| M2 System | Submit in the browser, watch the narration stream, see a blocker card | 🟡 done in-memory (#13) with a scripted model; real model pending the key |
| M3 Loop closed | Fix opens a real pull request, verify run succeeds | 🟡 locate, patch, five gates and verify work (scripted); PR code untested without a repo and token |
| M4 Hardened | Replay works offline, golden fixtures pass, dogfood green | ⬜ not started |
| M5 Shipped | Deployed, rehearsed three times, frozen | ⬜ not started |

---

## Session log

Newest first. One entry per working session. Keep entries short and factual.

### 2026-09-15 · Newsletter session

**Did**
- Live run `e907d2d4` "subscribe to the newsletter" was blocked at step 14 (`AMBIGUOUS_CONTROLS` from the loop detector)
  and Fix stopped at locate, 50%, on `<button>Subscribe</button>`. Two causes: Subscribe did nothing at all, so no
  patch could make the goal succeed (F-84), and a classless element could never pass 0.8 (F-85).
- Fixture: Subscribe now works, and its confirmation is a plain `<p className="newsletter-status">` that is not
  announced. Third planted blocker, DECISIONS.md #19. Mirrored into fixed-shop, style added to both.
- `baseline/axe.ts` + `runs/execute.ts`: after a silent Enter or Space, the fix target is the nearby confirmation
  that is outside a live region, with a `reason` quoted in the patch prompt. `patch/generate.ts` prompt rule for
  status messages. `sourcemap/ast-search.ts`: literal JSX text narrows candidates (0.9 for a classless unique match).
- Tests: 130 unit tests pass (new: `silent-activation.test.ts`, three F-85 locate cases, confirm X-10). Integration
  "F-84" on real Chromium with a scripted model: blocked, located `Newsletter.tsx:24` at 1.0, gates pass, verify run
  SUCCEEDED. Backend typecheck and lint clean.

**Next session should**
1. Restart `pnpm demo`, then run "subscribe to the newsletter" on 3100 with the real model and press Fix.
2. The loop detector still labels this wall `AMBIGUOUS_CONTROLS`; consider `STATE_NOT_ANNOUNCED` when the repeated
   state follows a silent activation.

### 2026-09-15 · Model switch session

**Did**
- Kimi K3 on NIM was timing out. Switched `.env` to Bynara (DECISIONS.md #17): base `https://router.bynara.id/v1`,
  decide `stepfun-3.7-flash,tencent-hy3-free`, narrate `stepfun-3.7-flash`, effort `low`, step timeout 30000,
  one concurrent run. No code changed. The API key line was not touched.

- Investigated a Fix that stopped at locate on `app/layout.tsx:24`. Fixed two bugs: F-81 (Fix on a run started by
  hand on 3101 wiped the earlier ProductCard patch) and F-82 (an unreachable blocker was mapped to the focused footer
  link). 108 unit tests and the 6 `api.test.ts` integration tests pass; backend typecheck and lint are clean.
- Confirmation now accepts a cart count heard rising after Enter or Space for add-to-cart goals, with a WCAG 4.1.3
  note when it was not announced (DECISIONS.md #18). 117 unit tests pass.
- F-83: a verify run on the patched shop was abandoned. After an unannounced Enter the agent lost the Tab order,
  re-activated the button and ran out of its 12 steps. Decisions now carry the walked Tab order, a second activation
  is flagged, and verify runs get at least 20 steps. Real model (stepfun-3.7-flash via Bynara) on 3101:
  "add a shirt to the cart" SUCCEEDED in 9 of 20 steps. 123 unit tests, 6 integration tests pass.
- Not fixed, seen in the same runs: a verify run where the model pressed Enter before moving focus, so the loop
  detector reported a false `AMBIGUOUS_CONTROLS`.

**Next session should**
1. Paste the `sk-nry-` key into `ALLY_OPENAI_COMPAT_API_KEY` and probe:
   `pnpm agent --url http://localhost:3100 --goal "complete checkout"`. Check that the model returns real tool calls.
2. If StepFun fails, try `tencent-hy3-free` first, then `laguna-s-2.1`.

### 2026-09-14 · Demo build session

**Did**
- Switched the model to Kimi K3 on NVIDIA NIM's free trial (DECISIONS.md #16, F-80). The adapter now reads NIM
  error details and falls back to `tool_choice: auto`. `.env` points at NIM; the `nvapi-` key still has to be
  pasted into `ALLY_OPENAI_COMPAT_API_KEY` by hand, then probed with `pnpm agent`. Rollback line kept in `.env`.
- Judging is 50% concept and architecture, 30% working prototype and UI, 20% Q&A, with a live online demo on
  2026-09-15. Built the demo path as one in-memory process instead of Days 2–5 as written (DECISIONS.md #13).
- `backend/src/api/server.ts` (Fastify: runs, report, SSE with `Last-Event-ID` replay, frame, fix, rerun,
  config, health), `runs/` (store, executor, queue), `preview/frames.ts`, `baseline/` (axe at both phases,
  blocker inspection, `correlate.ts`, causal map), `sourcemap/ast-search.ts`, `patch/` (generate, five gates:
  applies, parses, `tsc`, jsx-a11y strict on changed lines, size), `github/pull-request.ts` (token-based),
  `fix/` (orchestration, verify site sync), `lib/url-guard.ts` (F-01, partial).
- `fixtures/fixed-shop`: a copy of broken-shop on 3101 that patches are written into for the verify run.
- `frontend/`: landing with the run form and "how it works"; `/live/[runId]` split screen (frames left, heard
  transcript, agent narration and decisions right, two voices, live region, verdict, fix progress, diff,
  gates); `/run/[runId]` server-rendered report. Hand-written CSS, no Tailwind.
- Shared contract: `ServerConfig`, report fields `source`/`parentRunId`/`errorMessage`/`fixable`, `fix.stage`
  `skipped` + `detail`, error codes `MODEL_NOT_CONFIGURED` and `FIX_IN_PROGRESS`, health `absent`.
- `pnpm demo` starts broken-shop (3100), fixed-shop (3101), the API (4000) and the dashboard (3000).
- Tests: 94 backend unit tests (new: `correlate.test.ts`, `patch.test.ts`), `integration/api.test.ts` 4/4 on
  real Chromium with a scripted model, backend and frontend typecheck and lint clean. Playwright walk of the
  whole flow with axe: 0 violations on `/`, `/live/[id]` and `/run/[id]`.
- Failure modes F-73 to F-76 added; F-01 and F-07 statuses updated.

**Decided**
- #13: one process, runs in memory, frames from the agent's own page, AST search as the only source strategy.

**Bugs found and fixed**
- F-73 inherited `cursor: pointer` picked the icon as the fix target. F-75 our own live view failed axe.

**Did not do**
- Any run with a real model (no key). The overlay fix path for `FOCUS_NOT_TRAPPED` (F-74) is untested.
- A real pull request: needs `GITHUB_TOKEN` and `GITHUB_REPO` pointing at a repo that holds the fixture.
- Nothing committed or pushed. The demo script (F-68) still quotes an imagined transcript.

**Next session should**
1. Put the OpenRouter key in `ALLY_OPENAI_COMPAT_API_KEY` in `.env`, run the probe (2 requests), restart
   `pnpm demo`, and do one full run from the browser. Mind the 50-requests-a-day cap (F-78).
2. Rehearse Fix twice: after the add-button fix the verify run will likely hit the cart dialog. Check the
   overlay fix (F-74) and whether a second Fix on the verify run reaches "Goal completed".
3. Rewrite the demo script beat from the real run (F-68), then commit and freeze.

**Provider switch (same session, later)**
- Agent Router answers every request with 401 `unauthorized client detected` (F-77); not worked around.
- Added `llm/openai-compatible.ts` and `llm/factory.ts` (`ALLY_LLM_PROVIDER`), `ALLY_NARRATION=decision` (one call per step), free models priced at a known zero. `.env` set to OpenRouter with `nvidia/nemotron-3-ultra-550b-a55b:free`; key still empty. 101 unit tests pass.
- Free tier cap: 50 requests a day (F-78). Probe first with 2 requests, then one full rehearsal.
- Also fixed: the live view dropped the only frame of a run that ended quickly.
- First real run (run 226588e0): BLOCKED at step 9, UNLABELLED_CONTROL, "14 violations, zero of them the reason". The agent opened the cart at step 6 and heard nothing new (blocker 2), then concluded on blocker 1. 322 s total; step 5 took 58 s and step 6 116 s waiting on overloaded free endpoints, so `ALLY_STEP_TIMEOUT_MS` is now 25000 (fail over sooner) and each run logs which models served.
- Probe with the real key: Nvidia free endpoints overloaded, Gemma 429, Super wrote its tool call as text (F-79). Added a cross-provider fallback list and text tool-call recovery; the list then returned a valid `press_key` in 4.5 s. 6 of 50 daily requests used. 103 unit tests pass.

**Known debt added**
- Runs vanish on restart; one crashed browser can take down the API; no rate limit; no auth; the PR path uses a
  token rather than the GitHub App.

### 2026-09-14 · Phase 1 merge-check session

**Did**
- Fast-forwarded `main` to `origin/phase1` (`51cc81b`). Kept the submission deadline (15 Sept 2026).
- Re-checked Phase 1 on a second machine (Windows 11, Node 22.16, pnpm 11.23): `pnpm install
  --frozen-lockfile` clean; `shared` and `backend` typecheck and lint clean; 16 shared tests, 80 backend
  unit tests and the purity suite (6) pass; integration (3) passes against real Chromium.
- Checked by hand: `driver/index.ts` exports exactly the five functions; only `llm/anthropic.ts`
  imports the SDK; no screenshot, click, evaluate or `any` in `agent/` or `driver/`; `ci.yml` calls
  `test:purity`; both planted blockers are in the fixture.
- Added F-70 (fixture `standalone` build fails with EPERM on Windows) and F-71 (integration suite
  cannot spawn `pnpm` on Windows; Chromium must be installed per machine).
- No Anthropic account key exists. Added optional `ANTHROPIC_BASE_URL` (config, adapter, CLI, `.env.example`,
  one config test; 81 unit tests pass) so the gate can run through Agent Router. `DECISIONS.md` #12, proposed
  until a probe confirms the gateway accepts adaptive thinking, effort, strict tools and caching.
- Agent Router serves only Opus among Claude models. `.env` set to decide `claude-opus-5`, narrate
  `claude-opus-4-8`. Removed `temperature` from `narrate` (both reject it, F-72); added Opus 4.8 to
  `llm/cost.ts`. 82 unit tests pass.

**Did not do**
- The live-model gate: there is no `.env` on this machine.
- Did not push `main`, and did not fix F-70 or F-71.

**Next session should**
1. Same as the Phase 1 entry below: add a real key, run the gate, compare categories across three runs.
2. On Windows, turn on Developer Mode or serve the fixture with `next dev -p 3100` (F-70).

### 2026-09-14 · Phase 1 build session

**Did**
- `fixtures/broken-shop`: Next.js 15 storefront on port 3100 with both planted blockers
  (`ProductCard.tsx:41:7` add control as `<div onClick>`, `CartDialog.tsx:12` overlay with no role or
  focus management), the axe noise, and an accessible checkout ending at "Order confirmed".
- `backend/src/driver/`: `index.ts` exports exactly the five functions over an opaque session;
  `session.ts` opens, closes and binds; `cdp.ts` copies only the AX fields we keep; `stabilize.ts`
  (F-05); `hash.ts`; `tree.ts`; `serialize.ts` with full-read and diff modes, truncation, flags.
- `backend/src/llm/`: `provider.ts` (text-only requests), `anthropic.ts` (the only SDK import;
  SDK upgraded 0.32 → 0.125), `cost.ts`. `backend/src/config/` with zod.
- `backend/src/agent/`: `loop.ts`, `tools.ts`, `prompts.ts`, `narrate.ts` (F-18), `loop-detect.ts`
  (F-11), `confirm.ts` (F-13), `categories.ts`. Also F-04, F-10 minimum steps, F-17, run timeout.
- `backend/src/cli/agent.ts`: `pnpm agent --url --goal [--budget] [--expect] [--headed]`.
- Tests: 80 backend unit tests (serialiser S-01 to S-16 plus a golden test on a recorded real session,
  purity P-1 to P-5 with a transitive import walk, loop, loop detector, narration, confirmation,
  tools) and 3 integration tests on real Chromium. `backend/tests/tools/record-session.ts` records
  fixtures.
- ESLint: `agent/` may not import driver internals or the SDK; only `llm/` may import the SDK.
- Docs: failure modes F-64 to F-69 added and twelve statuses updated; six regression rows;
  `DECISIONS.md` #9 to #11; notes in docs/06; fixture README quotes the recorded transcript.

**Decided**
- #9: Sonnet 5 rejects `temperature`, so no sampling parameters; effort `low`; determinism rests on
  replay and category gating.
- #10: the five driver functions take an opaque session; opening one is privileged.
- #11: the provider interface carries whole text-only requests, so the purity spy sees real prompts.

**Bugs found and fixed** (all in the regression table)
- F-64 page root reported as focused; F-65 loop detector blaming the site for our bad decisions;
  F-69 re-perceived step 1 judged empty; F-67 the CI purity step never ran; the backend tsconfig
  could never typecheck; the success pattern would have accepted "Complete your order".

**Did not do**
- The live-model run. The key in `.env` is the placeholder, and a run spends money, so it needs you.
- F-10's `attemptsDescribed` field, the F-19 classifier, record and replay, and the SSRF guard: later days.
- The demo script still quotes an imagined transcript (F-68).

**Known red, expected**
- `frontend` lint, typecheck and test still fail only because it has no code yet (Day 2).

**Next session should**
1. Put a real `ANTHROPIC_API_KEY` in `.env`, start the fixture
   (`pnpm --filter @ally/fixture-broken-shop build && pnpm --filter @ally/fixture-broken-shop start`),
   then run `pnpm agent --url http://localhost:3100 --goal "complete checkout"`.
2. Judge the gate: `BLOCKED` at step 5 to 9 with `UNLABELLED_CONTROL` is the expected result. If the
   agent does something else, decide whether it is the prompt, the serialiser or the premise before Day 2.
3. Run it twice more and compare categories (F-12), then start Day 2.

### 2026-09-14 · Pre-Phase-1 setup session

**Did**
- Tooling: pnpm 11.23.0 via corepack, shim in `~/.local/bin` because `/usr/local/bin` is root-owned.
  `pnpm install` done, `pnpm-lock.yaml` created. Playwright Chromium installed (Playwright 1.63.0).
- pnpm 11 refuses unapproved install scripts. Approved `@prisma/client`, `@prisma/engines`, `prisma`,
  `esbuild`, `msgpackr-extract`; recorded under `allowBuilds` in `pnpm-workspace.yaml`.
- `.env` created from `.env.example`. `ANTHROPIC_API_KEY` still has to be pasted in by hand.
- `packages/shared/src/schemas.ts`: zod schemas for every shape, all types derived with `z.infer`.
  `index.ts` now only re-exports. Added the shapes docs/05 described but the package lacked:
  `RunCreated`, `RunListQuery`, `RunListResponse`, `FixStarted`, `HealthResponse`,
  `BarrierSubmitted`, `BarrierConfirm`, `BarrierConfirmed`. Tool-call schemas are strict, so an
  unknown field (e.g. `x`, `y`) is rejected. 16 unit tests in `packages/shared/tests/`.
- docs/05 synced: `fix.located` uses `locateMethod`/`locateConfidence` like the report and Prisma;
  `fix.pr` shows the full `PullRequestInfo`; list response and degraded health shape written down.
- Root `eslint.config.mjs` (flat config): typescript-eslint, `no-explicit-any` as an error in
  `agent/` and `driver/`, P-4 `no-restricted-imports` on `agent/` (verified with probe files),
  jsx-a11y strict on `frontend/`, `fixtures/` ignored. Frontend `lint` switched from the deprecated
  `next lint` to `eslint .`.

**Known red, expected**
- `pnpm lint`, `pnpm typecheck` and `pnpm test` fail in `backend` and `frontend` only because those
  packages contain no source or test files yet. Backend goes green with the first Day 1 file and
  `purity.test.ts`; frontend on Day 2. Deliberately did not add `--passWithNoTests`: it would let the
  CI purity job pass if `purity.test.ts` were missing.

**Next session should**
1. Paste `ANTHROPIC_API_KEY` into `.env`.
2. Start Day 1 in `docs/12-ROADMAP.md`: `fixtures/broken-shop` first (it has no `package.json`
   yet), then `driver/` and `driver/serialize.ts` against recorded trees.
3. Decision 5 says Playwright is pinned; `backend/package.json` still has `^1.49.0` (lockfile
   resolves 1.63.0). Pin it when the worker Dockerfile is touched.

### 2026-09-11 · Scaffolding session

**Did**
- Cloned `Webverse-Hackathon/hackathon` and scaffolded the workspace.
- Wrote the full documentation set, `docs/00` through `docs/13`.
- Recorded decisions 1 through 8 in `DECISIONS.md`.
- Created the pnpm workspace, three Dockerfiles, compose, and the CI workflow.

**Decided**
- Next.js 15 App Router for the frontend, Node 22 and Fastify for the backend.
- Claude Sonnet 5 to decide, Haiku 4.5 to narrate, behind a provider interface.
- Two modes: repo-connected can open pull requests, URL-only audits and suggests.

**Did not do**
- No feature code yet. Every `src/` directory is a skeleton.
- Docker is not installed on the primary machine.
- The GitHub App does not exist yet.

**Next session should**
1. Read `CLAUDE.md`, then `docs/12-ROADMAP.md` Day 1.
2. Write `packages/shared/src/` first. Everything else depends on it.
3. Build the driver and the serialiser, and get the day-one CLI printing a transcript.

---

## Open questions

Add to this list whenever something needs a human answer. Remove it when answered, and record the
answer in `DECISIONS.md`.

| # | Question | Who decides | Status |
|---|---|---|---|
| 1 | What is the actual submission deadline and demo slot length? | Team | Open |
| 2 | Which AWS account and region, and is there hackathon credit? | Mohnish | Open |
| 3 | Does the hackathon mandate a sponsor model or cloud? | Team | Open |
| 4 | Do we have a domain for the deployed demo, or is an IP acceptable? | Team | Open |
| 5 | Who are the three track owners in `docs/13-TEAM-SPLIT.md`? | Team | Open |

## Known debt

Things we chose to skip. Not bugs — decisions. Revisit after the hackathon.

| Item | Why we skipped it | Cost of skipping |
|---|---|---|
| Infrastructure as code | Four days | Manual deploys, drift, hard to reproduce the environment |
| Authentication | No accounts on day one | Anyone with the URL can run the agent; rate limits are the only control |
| Non-JSX source mapping | Out of scope | Blade, ERB, Twig and Razor targets get audit only |
| CSS-only blockers | Out of scope | A removed focus outline is reported but not patched |
| Multi-tenant isolation | Not needed for a demo | Everything shares one database and one browser pool |
