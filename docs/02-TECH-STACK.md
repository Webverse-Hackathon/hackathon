# 02 · Tech Stack

Every choice below is recorded with the alternative we rejected and the reason. If you want to
change one, add a numbered entry to `DECISIONS.md` rather than editing history here.

## Summary table

| Layer | Choice | Version |
|---|---|---|
| Frontend | Next.js, App Router, React 19, TypeScript | 15.x |
| Styling | Tailwind CSS + Radix UI primitives | 4.x / latest |
| Frontend state | TanStack Query + native `EventSource` | 5.x |
| Speech | Web Speech API (`speechSynthesis`), browser native | — |
| API | Fastify + zod + `fastify-type-provider-zod` | 5.x |
| Worker | Node worker process on the same codebase | Node 22 LTS |
| Browser automation | Playwright, Chromium, raw CDP for the AX tree | 1.4x |
| Rule baseline | `axe-core` via `@axe-core/playwright` | 4.x |
| Agent models | Claude Sonnet 5 (decide) + Claude Haiku 4.5 (narrate) | `claude-sonnet-5`, `claude-haiku-4-5-20251001` |
| LLM SDK | `@anthropic-ai/sdk`, behind our own provider interface | latest |
| Queue | BullMQ on Redis | 5.x |
| Database | PostgreSQL 16 + Prisma | 6.x |
| AST / codemod | ts-morph + `@babel/parser` | latest |
| Lint gate for patches | `eslint-plugin-jsx-a11y` | 6.x |
| GitHub | Octokit, as a GitHub App | latest |
| Monorepo | pnpm workspaces | pnpm 11 |
| Tests | Vitest (unit + integration), Playwright test (e2e) | latest |
| Containers | Docker, multi-stage, distroless-ish Node slim | — |
| Hosting | AWS ECS Fargate behind an ALB, ECR, RDS, ElastiCache | — |
| CI | GitHub Actions | — |

## Frontend: Next.js 15 App Router, not Vite

**Why Next.js.**

- `/run/[id]` is a **shareable artefact**. A judge, a manager or a compliance officer gets a link and
  sees a rendered report immediately, with real metadata for previews. Server components make that
  the default rather than a retrofit.
- Route handlers give us a thin backend-for-frontend layer. The browser never holds an API key, and
  CORS becomes a non-issue because the browser only ever talks to its own origin.
- `output: 'standalone'` produces a self-contained server bundle, which containerises cleanly without
  shipping `node_modules`.
- Streaming server components pair naturally with the run timeline.

**Why not Vite + React.** A smaller nginx image and faster HMR, but it loses server rendering for
the shareable report, and it needs a separate proxy layer to keep secrets off the client. On a
hackathon clock, "it renders and it shares" beats "the image is 150 MB smaller".

**The one thing the frontend must get right.** Ally is an accessibility product. If our own
dashboard fails an axe scan we lose the room. `eslint-plugin-jsx-a11y` runs in CI as an **error**,
and an axe scan of our own dashboard is a required CI job. Radix UI is chosen specifically because
its primitives are accessible by construction. See the dogfood suite in `10-TEST-CASES.md`.

## Backend: Node 22 + TypeScript + Fastify, not Python

**Why Node.**

- Playwright, axe-core and the JSX source mapping are all JavaScript-native. axe-core is literally a
  script injected into the page. In Python each of those becomes a bridge.
- The source mapper has to parse TypeScript and JSX. ts-morph does that natively; from Python it is
  the weakest link in the chain and the most likely thing to break at 3 a.m.
- One language across the repo means the request and response types in `packages/shared` are
  imported by both sides and cannot drift. On a three-person team with a four-day clock, contract
  drift is the most expensive bug class there is.

**Why Fastify, not Express.** Native schema validation and serialisation, first-class TypeScript
types derived from zod schemas, and a mature SSE story. Express would need three plugins to reach
the same place.

**Why not a serverless function per run.** Runs take thirty to ninety seconds, hold a browser open,
and stream output. That is a long-lived stateful worker, not a Lambda.

## Models: Sonnet 5 to decide, Haiku 4.5 to narrate

Two calls per step with different jobs:

| Call | Model | Why |
|---|---|---|
| Narrate | `claude-haiku-4-5-20251001` | Turns a transcript diff into one spoken sentence. Cheap and fast, and latency here is what the audience feels. |
| Decide | `claude-sonnet-5` | Chooses the next keystroke given the goal and history. Needs real reasoning about spatial-free navigation and strong tool use. |

Accessibility trees for a complex page run long, so we lean on prompt caching for the static part of
the prompt: system instructions, the goal, and the tool definitions. Only the transcript diff is
uncached per step.

**Provider interface.** Everything goes through `backend/src/llm/provider.ts`, which exposes
`narrate()` and `decide()`. Swapping providers means writing one adapter file. No feature code ever
imports an SDK directly.

## Playwright over Puppeteer or Selenium

Playwright gives us a stable CDP session, deterministic waiting, and a maintained Docker base image
with the right system libraries already installed. We use the raw CDP `Accessibility.getFullAXTree`
call rather than Playwright's own accessibility snapshot because only the CDP response carries
`backendDOMNodeId`, and that id is the only bridge from "the agent got stuck here" to "this is the
line of code".

## Postgres + Prisma, not SQLite or Mongo

Runs, steps, findings and patches are relational, and the report page is a join. We want real
foreign keys so a deleted run cannot leave orphan steps mid-demo. Prisma gives us migrations and
generated types that flow into the shared package. SQLite would work locally but ECS Fargate tasks
have no durable local disk, so we would have to migrate anyway.

## Redis for both queue and stream fan-out

BullMQ gives retries, concurrency limits and a dead-letter queue on top of Redis. The same Redis
instance carries the pub/sub channel that fans narration events from the worker to whichever API
replica the browser happens to be connected to. One dependency, two jobs.

## pnpm workspaces

```
ally/
├── package.json          workspace root, shared scripts
├── pnpm-workspace.yaml
├── packages/shared/      types + zod schemas, imported by both sides
├── backend/              api + worker, one codebase two entrypoints
├── frontend/
└── fixtures/broken-shop/ the deliberately broken demo target
```

pnpm because the content-addressed store keeps three Playwright-carrying installs from ballooning,
and workspace protocol links make `@ally/shared` a real import rather than a relative path climb.

## What we deliberately are not using

| Rejected | Why |
|---|---|
| LangChain / LlamaIndex | Our agent loop is about forty lines and needs exact control over the tool surface. A framework here hides the one thing that is the product. |
| A vector database | Nothing in this product is a retrieval problem. |
| Kubernetes | Three services and four days. ECS Fargate is the right size. |
| Terraform | Worth it for a company, not for four days. Deploy scripts plus task definitions are in `infra/aws/`. Noted as debt in `DECISIONS.md`. |
| Auth provider (Clerk / Auth0) | Day one has no accounts. If we add them, it is GitHub OAuth, because we already need GitHub App identity. |
| Real screen-reader binaries (NVDA / JAWS) | Cannot be containerised legally or reliably. The AX tree **is** what those tools read; serialising it ourselves is both honest and portable. Say this out loud if a judge asks. |
