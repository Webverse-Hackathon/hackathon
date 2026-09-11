# PROGRESS

**The single source of truth for where this project actually is.** Update it before you stop
working, every time, even mid-task. Especially mid-task.

---

## Header — keep this current

| | |
|---|---|
| **Submission deadline** | _TBD — fill this in_ |
| **Current day** | Day 0 — setup |
| **Demo status** | Not yet runnable end to end |
| **Blocking issue** | None |
| **Last updated** | 2026-09-11 by the scaffolding session |

## Milestone board

| Milestone | Definition of done | Status |
|---|---|---|
| M0 Setup | Repo, docs, workspace, tooling on every machine | 🟡 docs done, tooling pending |
| M1 Premise proven | CLI prints a transcript and a real blocker on `broken-shop` | ⬜ not started |
| M2 System | Submit in the browser, watch the narration stream, see a blocker card | ⬜ not started |
| M3 Loop closed | Fix opens a real pull request, verify run succeeds | ⬜ not started |
| M4 Hardened | Replay works offline, golden fixtures pass, dogfood green | ⬜ not started |
| M5 Shipped | Deployed, rehearsed three times, frozen | ⬜ not started |

---

## Session log

Newest first. One entry per working session. Keep entries short and factual.

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
