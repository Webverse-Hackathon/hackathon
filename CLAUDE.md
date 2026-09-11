# CLAUDE.md — read this first, every session

This file is loaded automatically at the start of every Claude Code session in this repo.
It is the index. Do not put detail here; put detail in `docs/` and link it.

## What Ally is, in one sentence

Every accessibility tool answers *"does this page break a rule?"* — Ally answers
*"can a blind person actually finish the task?"* by driving the site with **nothing but the
accessibility tree and a keyboard**, and reporting the exact step where it gave up.

## Hard rules for any session working in this repo

1. **Read `docs/09-FAILURE-MODES.md` before writing code in `backend/src/`.** It lists the
   traps that have already been identified or already bitten us. Do not rediscover them.
2. **Read `docs/10-TEST-CASES.md` before changing the agent loop, the AX serializer, or the
   patch generator.** Every one of those has golden fixtures that must keep passing.
3. **When you fix a bug, add a fixture for it** to `backend/tests/fixtures/` and a row to the
   regression table in `docs/10-TEST-CASES.md`. A bug without a fixture will come back.
4. **When you discover a new failure mode, append it to `docs/09-FAILURE-MODES.md`** with its
   trigger, symptom, and mitigation. That file is cumulative and never trimmed.
5. **Update `PROGRESS.md` at the end of every session.** It is the only record of where we are.
6. **Log any architectural decision in `DECISIONS.md`** as a numbered entry. If you are about to
   contradict an existing decision, say so explicitly and ask before doing it.
7. **The agent must never receive pixels.** No screenshots, no coordinates, no bounding boxes in
   any prompt or tool result. This constraint *is* the product. Enforced by a test — see
   `docs/10-TEST-CASES.md`, the purity suite.

## Where everything is

| Doc | What it answers |
|---|---|
| `docs/00-PROJECT-BRIEF.md` | The problem, the judging rubric, what winning looks like |
| `docs/01-ARCHITECTURE.md` | System diagram, every component, how data moves |
| `docs/02-TECH-STACK.md` | What we chose and why, with the rejected alternatives |
| `docs/03-USER-FLOWS.md` | Every flow, step by step, for each persona |
| `docs/04-DATA-MODEL.md` | Prisma schema, entity lifecycle, state machines |
| `docs/05-API-CONTRACT.md` | Every endpoint, every event on the stream |
| `docs/06-AGENT-LOOP.md` | Perceive → narrate → decide → act, prompts, budgets, stop conditions |
| `docs/07-SOURCE-MAPPING-AND-PATCH.md` | DOM node → JSX line → diff → PR |
| `docs/08-DEPLOYMENT-AWS.md` | Docker, ECS Fargate, the hackathon shortcut path |
| `docs/09-FAILURE-MODES.md` | **Cumulative.** Everything that can and does go wrong |
| `docs/10-TEST-CASES.md` | **Cumulative.** Golden fixtures, edge cases, regression table |
| `docs/11-DEMO-SCRIPT.md` | The five minutes on stage, second by second, plus fallbacks |
| `docs/12-ROADMAP.md` | Day-by-day plan, definition of done per milestone |
| `docs/13-TEAM-SPLIT.md` | Who owns what across the three of us |
| `PROGRESS.md` | Where we actually are right now |
| `DECISIONS.md` | Numbered architectural decision log |

## Repo layout

```
ally/
├── backend/          Node 22 · Fastify · TypeScript — API, agent, Playwright driver, patcher
├── frontend/         Next.js 15 App Router — dashboard, live narration, run reports
├── packages/shared/  TypeScript types shared by both. Single source of truth for contracts.
├── fixtures/         Deliberately broken demo sites the agent is tested against
├── infra/            Dockerfiles, compose, AWS task definitions, deploy scripts
└── docs/             Everything above
```

## Conventions that are not negotiable

- **Types live in `packages/shared`.** If the frontend and backend both know about a thing, its
  type is defined there and imported by both. Never duplicate an interface.
- **No `any` in `backend/src/agent/` or `backend/src/driver/`.** Those are the correctness-critical
  paths.
- **Every LLM call goes through `backend/src/llm/`.** No direct SDK calls scattered in feature code.
  This is what makes the provider swappable and the cost traceable.
- **Every run is reproducible.** Same run id → same recorded AX snapshots → replayable without
  network. See the determinism section of `docs/09-FAILURE-MODES.md`.
- Commits: `type(scope): summary` — e.g. `feat(agent): add loop detection on AX state hash`.

## Current state

See `PROGRESS.md`. Do not trust this section; trust that file.
