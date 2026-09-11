# 01 · Architecture

## The one-paragraph version

A Next.js dashboard posts a `{url, goal, repo?}` job to a Fastify API. The API persists a `Run` and
enqueues it. A worker opens the page in Playwright, and from that moment the page exists to the
system **only as an accessibility tree**. The AX tree is serialised into a screen-reader transcript,
handed to an agent loop that may reply with keystrokes and nothing else, and every perception and
decision is streamed to the browser over SSE and spoken aloud by the Web Speech API. In parallel,
axe-core scans the same page for a rule baseline. When the agent gives up, the blocking AX node is
mapped back to a DOM node, then to a source file and line, then to a minimal patch, then to a pull
request — and the same goal is re-run against the patched build to prove it now succeeds.

## System diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│  BROWSER  ·  Next.js 15 App Router                                       │
│                                                                          │
│  /                landing + "Run Ally" form (url, goal, optional repo)   │
│  /live/[runId]    SPLIT SCREEN — iframe of site  ‖  narration stream     │
│                   Web Speech API speaks each perception line aloud       │
│  /run/[runId]     server-rendered report: timeline, blocker, axe diff, PR│
│  /barrier         plain-language / spoken barrier submission             │
└───────────────┬───────────────────────────────────▲──────────────────────┘
                │ POST /api/runs                    │ SSE GET /api/runs/:id/stream
                ▼                                   │
┌──────────────────────────────────────────────────────────────────────────┐
│  API  ·  Fastify (Node 22, TypeScript)                                   │
│  · validates input (zod) · persists Run · enqueues job · relays SSE      │
│  · /fix endpoint · /barriers endpoint · GitHub webhook receiver          │
└───────┬──────────────────────────────┬───────────────────────▲───────────┘
        │ BullMQ enqueue               │ Prisma                │ Redis pub/sub
        ▼                              ▼                       │
┌───────────────┐            ┌──────────────────┐              │
│ Redis         │            │ Postgres         │              │
│ queue+pubsub  │            │ runs, steps,     │              │
└───────┬───────┘            │ findings, patches│              │
        │                    └──────────────────┘              │
        ▼                                                      │
┌──────────────────────────────────────────────────────────────┴───────────┐
│  WORKER  ·  Node 22 + Playwright (own container, own image)              │
│                                                                          │
│  ┌─ 1. DRIVER ────────────────────────────────────────────────────────┐  │
│  │  Playwright Chromium. CDP Accessibility.getFullAXTree.             │  │
│  │  ### SCREENSHOTS DISABLED AT THE DRIVER BOUNDARY ###               │  │
│  │  Exposes: axSnapshot(), pressKey(), typeText(), focusInfo()        │  │
│  └────────────┬──────────────────────────────────┬───────────────────┘  │
│               │ AX tree + backendDOMNodeIds      │ same page             │
│  ┌────────────▼────────────┐          ┌──────────▼───────────────────┐   │
│  │ 2. PERCEPTION           │          │ 3. BASELINE                  │   │
│  │ AX tree to screen-reader│          │ axe-core injected via        │   │
│  │ transcript lines.       │          │ @axe-core/playwright.        │   │
│  │ Diffs against the last  │          │ Produces rule violations.    │   │
│  │ snapshot, so we emit    │          │ Runs once at load, once at   │   │
│  │ only what was spoken.   │          │ the abandon state.           │   │
│  └────────────┬────────────┘          └──────────┬───────────────────┘   │
│               │ transcript                       │ violations            │
│  ┌────────────▼───────────────────────┐          │                       │
│  │ 4. AGENT LOOP                      │          │                       │
│  │ perceive - narrate - decide - act  │          │                       │
│  │ Tools: press_key, type_text,       │          │                       │
│  │ read_focus, declare_blocked,       │          │                       │
│  │ declare_success. NOTHING ELSE.     │          │                       │
│  │ Budget: 20 steps. Loop detector.   │          │                       │
│  └────────────┬───────────────────────┘          │                       │
│               │ Blocker{axNodeId, reason, wcag}  │                       │
│  ┌────────────▼──────────────────────────────────▼───────────────────┐   │
│  │ 5. BLOCKER CORRELATION  <- THE HEADLINE NUMBER                    │   │
│  │ Did ANY axe violation point at the node that actually blocked us? │   │
│  │ Outputs: caught_by_axe | missed_by_axe, plus the full diff table. │   │
│  └────────────┬──────────────────────────────────────────────────────┘   │
│               │ blocker -> backendDOMNodeId -> DOM path                   │
│  ┌────────────▼───────────────┐  (Mode A only: repo connected)            │
│  │ 6. SOURCE MAPPER           │                                           │
│  │ data-ally-src attribute    │  primary, deterministic                   │
│  │ React fiber _debugSource   │  fallback, dev builds                     │
│  │ ts-morph AST repo search   │  last resort, heuristic                   │
│  └────────────┬───────────────┘                                           │
│               │ file.tsx:lineStart-lineEnd                                │
│  ┌────────────▼───────────────┐                                           │
│  │ 7. PATCH GENERATOR         │  LLM writes a minimal diff.               │
│  │ VALIDATE: ts-morph parses, │  Rejected and retried (max 3) if the      │
│  │ tsc --noEmit, jsx-a11y     │  patch fails any validation gate.         │
│  └────────────┬───────────────┘                                           │
│               ▼                                                           │
│  ┌────────────────────────────┐      ┌─────────────────────────────────┐  │
│  │ 8. PR BOT (Octokit)        │─────▶│ 9. VERIFY RE-RUN                │  │
│  │ branch ally/fix-<runId>    │      │ same goal, patched build.       │  │
│  │ PR body = before/after     │◀─────│ Writes result back as a comment.│  │
│  └────────────────────────────┘      └─────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

## The nine components

### 1. Driver — `backend/src/driver/`

Wraps Playwright. **This is the trust boundary that makes the product honest.**

- Launches Chromium headless, attaches a CDP session.
- Uses `Accessibility.getFullAXTree` rather than Playwright's own accessibility snapshot, because
  the CDP call returns a `backendDOMNodeId` on every node. Without that id there is no path back to
  the DOM, and therefore no path to the source line. This choice is the spine of the whole pipeline.
- Also enables the `Accessibility` and `DOM` CDP domains.
- **Exposes exactly five operations upward**: `axSnapshot()`, `pressKey(key)`, `typeText(text)`,
  `focusInfo()`, `currentUrl()`. The Playwright `page` object is private to the module. There is no
  screenshot, no bounding box, and no coordinate click reachable from the agent side.
- The keystroke vocabulary is an allow-list: Tab, Shift+Tab, Enter, Space, Escape, the four arrows,
  Home, End, PageUp, PageDown, plus printable text through `typeText`. Anything else is rejected
  before it reaches Playwright.

### 2. Perception — `backend/src/driver/serialize.ts`

Turns the AX tree into what a screen reader would actually say.

- Walk the tree depth-first, skipping ignored nodes and presentational roles.
- Emit one line per meaningful node: role, accessible name, value, states (expanded, checked,
  disabled, required, invalid), heading level, and list position.
- A node whose role is button with no accessible name serialises as exactly `button.` — which is
  what the user hears, and what makes the demo land.
- **Diff mode**: after each keystroke we emit only what changed plus the newly focused node, the way
  a screen reader announces a transition rather than re-reading the page.
- Live-region handling: nodes inside an `aria-live` container are emitted as interrupt announcements.
- The serialiser is pure and synchronous, taking the current and previous trees and returning
  transcript lines. That makes it unit-testable against recorded trees with no browser at all.
  See `10-TEST-CASES.md`.

### 3. Baseline — `backend/src/baseline/`

Runs `@axe-core/playwright` against the same page at two moments: initial load, and the state where
the agent abandoned. Stores every violation with its rule id, impact, WCAG criterion, and the
`backendDOMNodeId` of each target node, resolved through CDP from the selector axe reports.

We run axe **not to use it** but to have a defensible number to compare against.

### 4. Agent loop — `backend/src/agent/`

Full detail in `06-AGENT-LOOP.md`. The shape:

```
state = { goal, stepBudget: 20, history: [], seenStateHashes: Set }
loop:
  transcript = perceive()                     # diff since last step
  decision   = llm(goal, history, transcript) # a tool call, one of five
  if decision is declare_success -> verify and exit SUCCEEDED
  if decision is declare_blocked -> exit BLOCKED with reason
  act(decision)                               # keystroke only
  if stateHash seen 3 times -> exit BLOCKED "agent looping"
  if steps > budget         -> exit ABANDONED
```

Two models, for cost and speed:

- **Haiku 4.5** writes the narration line for each perception, which is the text spoken aloud.
  Cheap and fast, called once per step.
- **Sonnet 5** makes the decision, choosing which key to press and why. Called once per step with
  the goal, the running history, and the new transcript.

### 5. Blocker correlation — `backend/src/baseline/correlate.ts`

The component that produces the sentence we say on stage.

Input: the blocker's `backendDOMNodeId` plus its ancestor chain, and every axe violation's target
node ids. Output, per run:

- `axeViolationCount` — total rule violations axe reported.
- `blockerCaughtByAxe` — true only if an axe violation targets the blocking node or one of its
  ancestors **and** its rule is causally related to the blocker category.
- `verdict` — the rendered sentence, for example: *axe reported 14 rule violations and zero of them
  was the reason the agent could not check out.*

Causal relation is a small explicit table, not a guess. Blocker category `unlabelled-control` relates
to axe rules `button-name`, `link-name` and `input-button-name`. Blocker category
`focus-not-trapped` relates to **no axe rule at all**, which is precisely the point.

### 6. Source mapper — `backend/src/sourcemap/`

Three strategies, tried in order. Full detail in `07-SOURCE-MAPPING-AND-PATCH.md`.

1. **A `data-ally-src` attribute.** A Babel plugin stamps file, line and column onto every JSX
   element at build time. Deterministic, survives production builds, framework independent. This is
   what the demo relies on.
2. **React fiber debug source.** Read the internal fiber property off the DOM node in development
   builds. Free when the target is a React dev server.
3. **A ts-morph repo search.** Parse the repository AST and find JSX elements whose literal text or
   attributes match the blocking node. Heuristic, ranked, and presented with a confidence score.

### 7. Patch generator — `backend/src/patch/`

Given the source window, the blocker description and the WCAG criterion, an LLM writes a **minimal**
unified diff. It is then run through hard gates, in order, and rejected on any failure:

1. The diff applies cleanly.
2. ts-morph parses the result.
3. `tsc --noEmit` passes on the changed file.
4. `eslint-plugin-jsx-a11y` reports no new errors.
5. The diff touches fifteen lines or fewer. A large diff means the model is rewriting, not fixing.

Three attempts, then we fall back to a suggested diff marked unverified.

### 8. PR bot — `backend/src/github/`

Octokit with a GitHub App installation token. Branch `ally/fix-<runId>`, one commit, and a PR body
containing the before narration, the blocker, the WCAG criterion, and the after narration once the
verify run completes.

### 9. Verify re-run — orchestrated by the worker

Re-runs the identical goal against the patched build, either a preview deployment or a locally built
container for the fixture site, and posts the outcome back to the PR as a comment. A PR whose verify
run still fails is labelled `ally:unverified` and is never presented as a fix.

## Data flow for one run, end to end

```
1.  POST /api/runs {url, goal, repo?}        -> Run{status: QUEUED}
2.  BullMQ job picked up by worker           -> Run{status: RUNNING}
3.  driver.open(url)                         -> axe baseline scan #1 stored
4.  loop step n:
      driver.axSnapshot()                    -> Step{perception}
      haiku narrate                          -> Step{narration}  -> SSE -> spoken
      sonnet decide                          -> Step{action, reasoning} -> SSE
      driver.pressKey(...)                   -> Step{result}
5.  agent declares blocked                   -> Blocker{axNodeId, category, wcag}
6.  axe baseline scan #2 at the abandon state
7.  correlate()                              -> Run{verdict, blockerCaughtByAxe}
8.  Run{status: BLOCKED}                     -> SSE terminal event -> report renders
--- user clicks Fix (Mode A only) ---
9.  POST /api/runs/:id/fix
10. sourcemap()                              -> Patch{file, lineStart, lineEnd}
11. generate + validate diff                 -> Patch{diff, validated: true}
12. octokit opens PR                         -> PullRequest{number, url}
13. verify re-run against patched build      -> Run'{status: SUCCEEDED, steps: 11}
14. comment on PR with before and after      -> demo complete
```

## Why a separate worker process

The API must stay responsive and small. A Playwright container carries Chromium plus system
libraries and lands around 1.2 GB, while the API image is under 200 MB. Separating them means we
scale the expensive thing independently, and an out-of-memory kill in a browser run cannot take down
the API. On AWS these are two ECS services against one Redis queue. See `08-DEPLOYMENT-AWS.md`.

## Streaming: why SSE and not WebSocket

The narration stream is strictly one-directional and append-only. Server-sent events give us
automatic reconnect with `Last-Event-ID` replay for free, pass through an application load balancer
with no upgrade handling, and need no client library. The worker publishes to a Redis channel per
run and the API subscribes and relays. Any API replica can serve any run's stream, so this scales
horizontally with no sticky sessions.

## Security boundaries

- The worker browses arbitrary user-supplied URLs. It runs in its own container as a non-root user,
  with no AWS credentials in its environment and egress restricted to HTTP and HTTPS.
- URL validation rejects private and link-local ranges before the browser is told to navigate. This
  is server-side request forgery prevention and it is not optional. See `09-FAILURE-MODES.md`.
- GitHub write access is a GitHub App installation token scoped to the repositories the user
  installed the app on. We never ask for a personal access token.
- LLM prompts include page text from third-party sites. That text is untrusted input, and is fenced
  and labelled as data in every prompt. Prompt-injection handling is covered in `06-AGENT-LOOP.md`.
