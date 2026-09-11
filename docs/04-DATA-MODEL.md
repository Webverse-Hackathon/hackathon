# 04 · Data Model

Postgres 16 via Prisma. The schema below is the source of truth for
`backend/prisma/schema.prisma`. Generated Prisma types are re-exported through `@ally/shared` so the
frontend never redefines them.

## Entity relationships

```
BarrierReport ─(0..1)─▶ Run ─(1..n)─▶ Step
                        │
                        ├─(0..1)─▶ Blocker ─(0..1)─▶ Patch ─(0..1)─▶ PullRequest
                        │                                              │
                        ├─(1..n)─▶ AxeFinding                          │
                        │                                              │
                        └─(0..1)─▶ Run (verifyRun, self-reference) ◀────┘
```

A run has many steps and many axe findings. A blocked run has exactly one blocker. A blocker may
produce one patch, which may produce one pull request, which triggers one verify run — itself a
normal `Run` row pointing back at its parent.

## Schema

```prisma
// backend/prisma/schema.prisma

enum RunStatus {
  QUEUED
  RUNNING
  SUCCEEDED     // agent reached the goal
  BLOCKED       // agent declared itself stuck — the interesting case
  ABANDONED     // step budget exhausted without a declaration
  ERRORED       // our fault: crash, timeout, unreachable target
}

enum RunSource {
  MANUAL
  CI
  BARRIER_REPORT
  VERIFY          // the re-run after a patch
}

enum RunMode {
  REPO_CONNECTED  // Mode A — can open a pull request
  URL_ONLY        // Mode B — audit and suggested diff only
}

enum StepKind {
  PERCEPTION
  NARRATION
  DECISION
  ACTION
  SYSTEM
}

enum BlockerCategory {
  UNLABELLED_CONTROL
  FOCUS_NOT_TRAPPED
  FOCUS_ORDER_BROKEN
  KEYBOARD_TRAP
  NO_KEYBOARD_PATH
  MEANINGLESS_NAME       // alt text exists but says image_04.png
  STATE_NOT_ANNOUNCED    // aria-live missing, modal never announces
  AMBIGUOUS_CONTROLS     // many identically named controls
  CONTENT_NOT_REACHABLE
  UNKNOWN
}

model Run {
  id              String     @id @default(cuid())
  url             String
  goal            String
  status          RunStatus  @default(QUEUED)
  source          RunSource  @default(MANUAL)
  mode            RunMode    @default(URL_ONLY)

  // Mode A only
  repoOwner       String?
  repoName        String?
  repoCommitSha   String?
  repoBranch      String?

  stepBudget      Int        @default(20)
  stepsUsed       Int        @default(0)

  // correlation output — the headline
  axeViolationCount   Int?
  blockerCaughtByAxe  Boolean?
  verdict             String?   // the rendered sentence shown on stage

  // cost and timing
  startedAt       DateTime?
  finishedAt      DateTime?
  durationMs      Int?
  inputTokens     Int        @default(0)
  outputTokens    Int        @default(0)
  costUsd         Decimal?   @db.Decimal(10, 6)

  errorMessage    String?

  // determinism: the recorded AX snapshots for replay without a network
  recordingKey    String?    // S3 key, or a local path in development

  parentRunId     String?    // set on a VERIFY run, pointing at the original
  parentRun       Run?       @relation("Verify", fields: [parentRunId], references: [id])
  verifyRuns      Run[]      @relation("Verify")

  steps           Step[]
  axeFindings     AxeFinding[]
  blocker         Blocker?
  barrierReport   BarrierReport?

  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  @@index([status, createdAt])
  @@index([repoOwner, repoName, repoCommitSha])
}

model Step {
  id            String    @id @default(cuid())
  runId         String
  run           Run       @relation(fields: [runId], references: [id], onDelete: Cascade)

  index         Int       // 1-based step number within the run
  kind          StepKind

  // PERCEPTION — what the screen reader would have said
  transcript    Json?     // TranscriptLine[]
  axStateHash   String?   // sha256 of the normalised AX tree, for loop detection

  // NARRATION — the spoken line
  narration     String?

  // DECISION — what the agent chose and why
  toolName      String?   // press_key | type_text | read_focus | declare_* 
  toolInput     Json?
  reasoning     String?
  confidence    Float?    // the agent's own stated confidence, 0..1

  // ACTION — what actually happened
  actionResult  String?
  focusBefore   Json?
  focusAfter    Json?

  latencyMs     Int?
  createdAt     DateTime  @default(now())

  @@unique([runId, index])
  @@index([runId, kind])
}

model AxeFinding {
  id              String   @id @default(cuid())
  runId           String
  run             Run      @relation(fields: [runId], references: [id], onDelete: Cascade)

  phase           String   // "load" | "abandon"
  ruleId          String   // e.g. "button-name"
  impact          String?  // minor | moderate | serious | critical
  wcagTags        String[] // e.g. ["wcag2a", "wcag412"]
  description     String
  helpUrl         String?

  targetSelector  String
  backendNodeId   Int?     // resolved through CDP so we can compare against the blocker
  htmlSnippet     String?

  relatedToBlocker Boolean @default(false)  // set by correlate()

  @@index([runId, phase])
}

model Blocker {
  id              String          @id @default(cuid())
  runId           String          @unique
  run             Run             @relation(fields: [runId], references: [id], onDelete: Cascade)

  atStep          Int
  category        BlockerCategory
  summary         String          // one sentence, shown on the report
  agentReasoning  String          // what the agent said when it gave up

  // the node that stopped us
  axNodeId        String?
  backendNodeId   Int?
  domPath         String?         // CSS path, for humans
  role            String?
  accessibleName  String?         // often null — that IS the finding
  htmlSnippet     String?

  wcagCriteria    String[]        // e.g. ["4.1.2", "2.4.3"]

  patch           Patch?
  createdAt       DateTime        @default(now())
}

model Patch {
  id            String   @id @default(cuid())
  blockerId     String   @unique
  blocker       Blocker  @relation(fields: [blockerId], references: [id], onDelete: Cascade)

  // source location
  filePath      String
  lineStart     Int
  lineEnd       Int
  locateMethod  String   // "data-attribute" | "react-fiber" | "ast-search"
  locateConfidence Float // 1.0 for the attribute, lower for the AST search

  diff          String   // unified diff
  rationale     String
  linesChanged  Int

  // validation gates
  validated     Boolean  @default(false)
  gateResults   Json     // { appliesCleanly, parses, typechecks, jsxA11y, sizeOk }
  attempts      Int      @default(1)

  pullRequest   PullRequest?
  createdAt     DateTime @default(now())
}

model PullRequest {
  id          String   @id @default(cuid())
  patchId     String   @unique
  patch       Patch    @relation(fields: [patchId], references: [id], onDelete: Cascade)

  owner       String
  repo        String
  number      Int
  url         String
  branch      String
  state       String   @default("open")   // open | merged | closed
  verified    Boolean  @default(false)    // did the verify run succeed
  createdAt   DateTime @default(now())

  @@unique([owner, repo, number])
}

model BarrierReport {
  id              String   @id @default(cuid())

  rawText         String   // exactly what the user said, never paraphrased in storage
  inputMethod     String   // "typed" | "spoken"

  // LLM extraction, confirmed by the user before anything runs
  extractedUrl    String?
  extractedGoal   String?
  expectedFailure String?
  assistiveTech   String?
  confirmedByUser Boolean  @default(false)

  outcome         String?  // "REPRODUCED" | "NOT_REPRODUCED" | "DIFFERENT_WALL" | "PENDING"

  runId           String?  @unique
  run             Run?     @relation(fields: [runId], references: [id])

  contactEmail    String?  // optional, so we can tell them when the PR merges
  createdAt       DateTime @default(now())

  @@index([outcome, createdAt])
}
```

## Run state machine

```
            ┌──────────┐
  POST ───▶ │  QUEUED  │
            └────┬─────┘
                 │ worker picks up the job
            ┌────▼─────┐
            │ RUNNING  │───── crash / timeout / unreachable ───▶ ERRORED
            └────┬─────┘
                 │
     ┌───────────┼────────────┬──────────────────┐
     │           │            │                  │
declare_success  declare_blocked   budget hit    loop detected
     │           │            │                  │
     ▼           ▼            ▼                  ▼
 SUCCEEDED    BLOCKED     ABANDONED          BLOCKED
                 │                          (category = derived)
                 │ POST /fix  (Mode A only)
                 ▼
           Patch -> PullRequest -> VERIFY Run (a new Run row, source = VERIFY)
```

Only `BLOCKED` runs can be fixed. `ABANDONED` means the agent ran out of budget without being able
to name a blocker, which is itself a finding but not a patchable one — we surface it as *"the agent
could not even determine why it was stuck,"* which is a worse result for the site, not a better one.

## Invariants the code must uphold

1. A `Run` in a terminal status never gains new steps. Enforced in the worker, asserted in tests.
2. `Step.index` is contiguous from 1. A gap means we dropped a step and the timeline lies.
3. A `Blocker` exists if and only if `Run.status == BLOCKED`.
4. `Run.blockerCaughtByAxe` is null until both axe phases have completed. The report must render a
   pending state rather than a false zero — claiming axe missed something before axe has finished is
   the single most embarrassing bug we could ship.
5. `Patch.validated == false` means the diff is never presented as a fix, only as a suggestion.
6. `BarrierReport.rawText` is immutable. We store the user's own words, always.
7. A `VERIFY` run uses the identical `goal` and `stepBudget` as its parent. Changing either would
   make the before-and-after comparison dishonest.

## Retention

Runs and steps are kept for thirty days, recordings for seven. Barrier reports are kept
indefinitely, because they are the human record. There is no PII in a run beyond the URL, and
barrier report contact email is optional and nullable.
