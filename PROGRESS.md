# PROGRESS

**The single source of truth for where this project actually is.** Update it before you stop
working, every time, even mid-task. Especially mid-task.

---

## Header — keep this current

| | |
|---|---|
| **Submission deadline** | _TBD — fill this in_ |
| **Current day** | Day 1 built; its live-model gate is pending an API key |
| **Demo status** | CLI runs against broken-shop; not yet run with a real model |
| **Blocking issue** | `ANTHROPIC_API_KEY` in `.env` is still the placeholder, so the Day 1 gate cannot be run |
| **Last updated** | 2026-09-14 by the Phase 1 build session |

## Milestone board

| Milestone | Definition of done | Status |
|---|---|---|
| M0 Setup | Repo, docs, workspace, tooling on every machine | 🟢 done on the primary machine (solo for now); GitHub App deferred to Day 3 |
| M1 Premise proven | CLI prints a transcript and a real blocker on `broken-shop` | 🟡 everything built and tested with a scripted model and real Chromium; live-model run pending the API key |
| M2 System | Submit in the browser, watch the narration stream, see a blocker card | ⬜ not started |
| M3 Loop closed | Fix opens a real pull request, verify run succeeds | ⬜ not started |
| M4 Hardened | Replay works offline, golden fixtures pass, dogfood green | ⬜ not started |
| M5 Shipped | Deployed, rehearsed three times, frozen | ⬜ not started |

---

## Session log

Newest first. One entry per working session. Keep entries short and factual.

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
