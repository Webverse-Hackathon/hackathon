# 13 · Team Split

Three people. The split below is by **vertical slice**, not by layer, so nobody is blocked waiting
for someone else's layer to exist.

Fill in the names on day 0.

## Ownership

| Track | Owner | Owns | Touches |
|---|---|---|---|
| **A · Perception and agent** | _name_ | `backend/src/driver/`, `backend/src/agent/`, `backend/src/llm/`, `fixtures/` | The riskiest code in the project |
| **B · Platform and product** | _name_ | `backend/src/api/`, `backend/src/queue/`, `backend/src/db/`, `frontend/` | The thing the judges actually look at |
| **C · Fix pipeline and infra** | _name_ | `backend/src/sourcemap/`, `backend/src/patch/`, `backend/src/github/`, `infra/`, `.github/workflows/` | The thing that makes it a product, not a demo |

Track A owns the purity suite. Track B owns the dogfood suite. Track C owns CI and the deploy.

## The contract that keeps the tracks independent

`packages/shared` is written **on day 0, before any feature code**, and is the seam between all
three tracks. Types and zod schemas for: `RunRequest`, `RunSummary`, `RunReport`, `TranscriptLine`,
`StepEvent`, `BlockerInfo`, `AxeFindingInfo`, `PatchInfo`, every SSE event, and the error shape.

Once that file exists, Track B can build the entire UI against mock data while Track A is still
fighting Chromium, and Track C can build the patch pipeline against a hand-written blocker fixture.
**Changing a shared type requires telling the other two people before you push it.** That is the
only hard process rule here.

## Day-by-day, per track

### Day 1

| Track | Work |
|---|---|
| A | The driver, the serialiser, the agent loop, the CLI. The day-one stop-and-reassess gate is yours. |
| B | `packages/shared` first, then Prisma schema, Fastify skeleton, Next.js skeleton with the split screen against mock SSE events |
| C | `fixtures/broken-shop` built and running, docker compose up with Postgres and Redis, the Babel source plugin, the GitHub App created |

Track C builds the fixture on day 1 because Track A cannot test without it. That is the first
dependency in the project, and it is worth resolving before anything else.

### Day 2

| Track | Work |
|---|---|
| A | axe baseline, the correlator and the verdict, transcript truncation, stabilisation |
| B | Wire the real API and the real stream, the report page, speech synthesis with two voices |
| C | The source mapper against the fixture, the patch prompt and the five gates |

### Day 3

| Track | Work |
|---|---|
| A | Blocker categories, the deterministic classifier, success confirmation, the loop detector |
| B | The fix progress UI, the verdict banner, polish, the dashboard's own accessibility |
| C | Octokit, the pull request, the verify run, `fixtures/fixed-shop` |

### Day 4

| Track | Work |
|---|---|
| A | Record and replay, the golden fixture suite, the injection and narration guards |
| B | Barrier Report end to end, the dogfood suite |
| C | Deploy Path A, CI green, the SSRF guard, the orphan sweeper |

### Day 5

Everyone: rehearse, fix, freeze. Track B drives the demo laptop, Track A narrates, Track C spots.
See the roles in `11-DEMO-SCRIPT.md`.

## Working agreements

- **Branch per track**, `track-a/...`, `track-b/...`, `track-c/...`. Pull requests into `main`.
  Small and often. A branch alive longer than a day is a merge conflict waiting for the worst
  possible moment.
- **CI must be green to merge.** The purity suite is blocking. No exceptions, including at 3 a.m.
- **Anyone may append to `09-FAILURE-MODES.md` at any time, without review.** Discovering a failure
  mode and not writing it down is the most expensive thing anyone can do on this team.
- **Standup twice a day**, ten minutes, at the start and at the end. The end-of-day one exists to
  decide whether anything gets cut, using the cut list in `12-ROADMAP.md`.
- **Update `PROGRESS.md` before you stop working**, even if you stop mid-task. Especially then.
- **One person owns the demo laptop from day 5.** Nobody else installs anything on it.

## Escalation

If a track is blocked for more than ninety minutes, it stops being that track's problem and becomes
the team's. Say so out loud. The cut list exists precisely so that decision is fast and unemotional.
