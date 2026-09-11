# Ally

**An agent that tries to use your website the way a blind person does — keyboard only, screen reader
only — and tells you the exact step where it gave up.**

Every existing accessibility tool answers *"does this page break a rule?"*
Ally answers a different question: **"can a blind person buy the ticket?"**

---

## The idea in sixty seconds

You give Ally a URL and a goal in plain English: *"book an appointment."*

Playwright opens the page, but Ally is **denied the screenshot**. It receives only the accessibility
tree — the same text stream a screen reader speaks — and it may only send keystrokes. No
coordinates, no vision. That constraint is the simulation.

An LLM agent tries to reach the goal from that stream alone, one keystroke at a time, narrating what
it can perceive and what it is guessing. When it gets stuck, Ally maps the dead end back to the DOM
node and the source file, generates the patch, opens a pull request, re-runs the same goal against
the patched build, and shows the run now succeeding.

Underneath, axe-core runs as a baseline. The headline result is the **diff** between them:

> *axe reported 14 rule violations and zero of them was the reason the agent could not check out.*

## Why this matters

In the 2026 WebAIM Million study, **95.9%** of the top one million home pages failed automated WCAG
checks — up from 94.8%, reversing six straight years of improvement. The average page carries
**56.1** accessibility errors, up 10% year on year. Roughly **1.3 billion** people live with
significant disability, and they are being locked out of software faster than we are fixing it.

Rule checkers catch about a third of real problems. They cannot detect alt text that says
`image_04.png`, a focus order that jumps header to footer, a modal that never announces itself, or a
checkout that is perfectly labelled and still impossible to finish without a mouse.

That gap — between *passes the linter* and *a person can complete the task* — is the whole product.

---

## Documentation

**Start with [CLAUDE.md](CLAUDE.md).** It is the index, and it is loaded automatically at the start
of every Claude Code session in this repo.

| Doc | What it answers |
|---|---|
| [docs/00-PROJECT-BRIEF.md](docs/00-PROJECT-BRIEF.md) | The problem, the rubric, what winning looks like |
| [docs/01-ARCHITECTURE.md](docs/01-ARCHITECTURE.md) | System diagram, every component, how data moves |
| [docs/02-TECH-STACK.md](docs/02-TECH-STACK.md) | What we chose and why, with the rejected alternatives |
| [docs/03-USER-FLOWS.md](docs/03-USER-FLOWS.md) | Six flows, step by step, per persona |
| [docs/04-DATA-MODEL.md](docs/04-DATA-MODEL.md) | Prisma schema, state machine, invariants |
| [docs/05-API-CONTRACT.md](docs/05-API-CONTRACT.md) | Every endpoint and every stream event |
| [docs/06-AGENT-LOOP.md](docs/06-AGENT-LOOP.md) | The loop, the five tools, the prompts, the budgets |
| [docs/07-SOURCE-MAPPING-AND-PATCH.md](docs/07-SOURCE-MAPPING-AND-PATCH.md) | DOM node to JSX line to pull request |
| [docs/08-DEPLOYMENT-AWS.md](docs/08-DEPLOYMENT-AWS.md) | Docker, ECS Fargate, and the hackathon shortcut |
| [docs/09-FAILURE-MODES.md](docs/09-FAILURE-MODES.md) | **Cumulative.** Everything that can and does go wrong |
| [docs/10-TEST-CASES.md](docs/10-TEST-CASES.md) | **Cumulative.** Golden fixtures, edge cases, regressions |
| [docs/11-DEMO-SCRIPT.md](docs/11-DEMO-SCRIPT.md) | The five minutes on stage, plus fallbacks |
| [docs/12-ROADMAP.md](docs/12-ROADMAP.md) | Day by day, with the cut list |
| [docs/13-TEAM-SPLIT.md](docs/13-TEAM-SPLIT.md) | Who owns what |
| [PROGRESS.md](PROGRESS.md) | Where we actually are right now |
| [DECISIONS.md](DECISIONS.md) | Numbered architectural decision log |

---

## Repo layout

```
ally/
├── backend/            Node 22 · Fastify · TypeScript
│   ├── src/agent/      the perceive-narrate-decide-act loop
│   ├── src/driver/     Playwright + CDP, accessibility tree only
│   ├── src/baseline/   axe-core, and the blocker correlator
│   ├── src/sourcemap/  DOM node to JSX line
│   ├── src/patch/      diff generation and the five validation gates
│   ├── src/github/     Octokit, branches, pull requests
│   ├── src/api/        Fastify routes and the SSE stream
│   └── src/llm/        the provider interface — every model call goes through here
├── frontend/           Next.js 15 App Router
├── packages/shared/    types and zod schemas, imported by both sides
├── fixtures/           deliberately broken sites, with known expected outcomes
├── infra/              Dockerfiles, compose, AWS, deploy scripts
└── docs/               everything above
```

---

## Getting started

Prerequisites: Node 22, pnpm 11, Docker Desktop, and an `ANTHROPIC_API_KEY`.

```bash
pnpm install
cp .env.example .env                        # fill in ANTHROPIC_API_KEY
docker compose up -d postgres redis
pnpm --filter @ally/backend prisma migrate dev
pnpm dev                                    # api :4000 · worker · frontend :3000
```

Run the agent from the terminal, without the UI:

```bash
pnpm agent --url http://localhost:3100 --goal "complete checkout"
```

Everything in containers:

```bash
docker compose up --build
```

## Tests

```bash
pnpm test              # unit, golden fixtures, and the blocking purity suite
pnpm test:integration  # real Chromium against the fixture sites
pnpm test:e2e          # the full fix-to-pull-request flow
```

The **purity suite** asserts that no prompt we send contains an image or a coordinate. If it fails,
the premise is broken. It blocks CI.

---

## The rule that keeps this honest

The agent receives **only** a serialised accessibility tree and may emit **only** keystrokes.

The Playwright page object is private to the driver module, and the only exported surface is five
functions, none of which return pixels, coordinates, bounding boxes or raw HTML. Not "we mostly
avoid screenshots" — enforced by module boundaries, a lint rule, and a blocking test.

---

Built for the Webverse hackathon by [Webverse-Hackathon](https://github.com/Webverse-Hackathon).
