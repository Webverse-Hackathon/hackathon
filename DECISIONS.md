# DECISIONS

An architectural decision log. Append only. **If you are about to contradict an entry here, say so
explicitly and get agreement before doing it.**

Format:

```md
## N · Title
**Date** · **Status:** accepted | superseded by #M | revisited
**Context:** what forced the choice
**Decision:** what we chose
**Rejected:** what we did not choose, and why
**Consequence:** what this costs us later
```

---

## 1 · Next.js 15 App Router for the frontend
**2026-09-11 · accepted**

**Context.** We need a dashboard, a live split-screen view, and a report page that can be shared as
a link with judges and compliance owners.

**Decision.** Next.js 15 with the App Router, React 19, Tailwind, and Radix UI primitives.

**Rejected.** Vite plus React as a pure SPA. It produces a much smaller container and has faster hot
reload, but it loses server rendering for the shareable report and needs a separate proxy to keep
API keys off the client.

**Consequence.** A larger frontend image, around 180 MB against 25 MB, and a Node runtime to operate
rather than static files. Accepted in exchange for shareable server-rendered reports and a built-in
backend-for-frontend layer.

---

## 2 · Node 22 and TypeScript for the backend, not Python
**2026-09-11 · accepted**

**Context.** The backend has to drive Playwright, inject axe-core, and parse JSX to find a source
line.

**Decision.** Node 22, Fastify, TypeScript, one codebase with two entrypoints for the API and the
worker.

**Rejected.** Python with FastAPI. Playwright's Python bindings are good, but axe-core would have to
be injected as a raw JavaScript string, and the JSX source mapper would mean parsing TypeScript from
Python. That is the weakest link in the most important chain.

**Consequence.** We give up Python's LLM tooling ecosystem. In exchange we get one language, one
lockfile, and shared types that cannot drift between frontend and backend.

---

## 3 · Claude Sonnet 5 to decide, Haiku 4.5 to narrate
**2026-09-11 · accepted**

**Context.** Each step needs one reasoning call and one presentation call, and both are on the
critical path for the live demo's pacing.

**Decision.** `claude-sonnet-5` for the decision, at temperature 0, with prompt caching on the
static blocks. `claude-haiku-4-5-20251001` for the spoken narration.

**Rejected.** One model for both, which wastes reasoning capacity on a formatting task and adds
latency the audience feels. Also rejected a local model, which cannot be relied on for tool use at
this quality on a four-day clock.

**Consequence.** Provider lock-in, mitigated by routing every call through
`backend/src/llm/provider.ts` so a swap is one adapter file.

---

## 4 · Two modes — repo-connected patches, URL-only audits
**2026-09-11 · accepted**

**Context.** You cannot map an arbitrary live URL back to source, because the source is not
available. But a demo that only works on our own site is unconvincing.

**Decision.** Mode A, repo-connected: URL plus a GitHub repository, giving the full pipeline through
to a real pull request and a verify run. Mode B, URL only: any public site, giving the audit, the
blocker, the axe comparison and a suggested unanchored diff, but no pull request. We ship a
deliberately broken storefront as the Mode A demo target.

**Rejected.** Repo-connected only, which would mean we could not run against a judge's site on
stage. Also rejected audit-only, which would drop the strongest demo beat in the brief.

**Consequence.** Two code paths and two UI states to maintain. Worth it: Mode B answers *"run it on
my site"* and Mode A delivers the pull request moment.

---

## 5 · CDP `Accessibility.getFullAXTree`, not Playwright's accessibility snapshot
**2026-09-11 · accepted**

**Context.** We need a path from an accessibility node back to a DOM node, and onward to a source
line.

**Decision.** Attach a raw Chrome DevTools Protocol session and call
`Accessibility.getFullAXTree`, because only that response carries `backendDOMNodeId` on every node.

**Rejected.** Playwright's own accessibility snapshot, which is friendlier but drops the node
identity we need.

**Consequence.** We depend on a lower-level protocol that can change between Chromium versions. The
Playwright version is pinned in both `package.json` and the worker Dockerfile.

---

## 6 · Server-sent events, not WebSocket
**2026-09-11 · accepted**

**Context.** The narration stream is one-directional and append-only, and it must survive a dropped
connection during a live demo.

**Decision.** SSE, with `Last-Event-ID` replay backed by Redis pub/sub and Postgres persistence.

**Rejected.** WebSocket, which adds a bidirectional channel we do not need, needs upgrade handling
at the load balancer, and needs a client library.

**Consequence.** No client-to-server channel on the stream. Anything the user initiates is a normal
POST, which is the right shape anyway.

---

## 7 · A `data-ally-src` build-time attribute as the primary source map
**2026-09-11 · accepted**

**Context.** Mapping a DOM node to a JSX line has to be reliable enough to open a pull request from,
and explainable to a judge in one sentence.

**Decision.** A Babel or SWC plugin stamps `file:line:column` onto every JSX element, gated behind
an environment flag. React fiber debug source is the fallback for development builds, and a ts-morph
AST search is the last resort, gated at 0.8 confidence before it may proceed without a human.

**Rejected.** Relying on production source maps, which are frequently absent, often stripped, and
which map bundled output rather than component structure.

**Consequence.** Full-fidelity patching requires the target repository to opt in with one build
flag. That is exactly the Mode A boundary from decision 4, and we state it openly.

---

## 8 · One EC2 instance with docker compose for the hackathon; ECS Fargate as the scale story
**2026-09-11 · accepted**

**Context.** Four days, three services, and a deploy cycle that has to be measured in seconds when
something breaks at midnight.

**Decision.** Deploy on one `t3.large` running docker compose behind Caddy, with an elastic IP.
Design, document and partially build the ECS Fargate architecture, and present it as the scale path.

**Rejected.** ECS Fargate from day one. A five-to-ten-minute deploy cycle and an hour lost to a
broken task definition is a cost we cannot absorb during a build sprint.

**Consequence.** A single point of failure and no automatic scaling during the hackathon. Mitigated
by the replay fallback, which does not need the server at all.

---

## 9 · No sampling parameters on the decision model; determinism rests on replay
**2026-09-14 · accepted** · refines #3

**Context.** Decision #3 and `docs/06-AGENT-LOOP.md` call for temperature 0 on the decision model.
Claude Sonnet 5 rejects `temperature`, `top_p` and `top_k` with a 400, and runs adaptive thinking by
default. With thinking on, a forced `tool_choice` is not allowed either.

**Decision.** Keep Sonnet 5. Send no sampling parameters, keep adaptive thinking at effort `low`
(`ALLY_DECIDE_EFFORT`), use `tool_choice: auto` with one tool call per turn, strict tool schemas, and
a system instruction to always call exactly one tool. A response with no usable call is retried once
with the error, then counted.

**Rejected.** Dropping to a model that accepts temperature: a weaker decision model in exchange for
a determinism guarantee the other mitigations already provide. Disabling thinking: documented to
make newer models occasionally write a tool call as text instead of calling it.

**Consequence.** Two live runs can differ in steps. That was already true across provider-side
changes (F-12), so CI and the demo gate on blocker category, and the stage fallback is replay. F-66.

---

## 10 · The driver's five functions take an opaque session; opening one is privileged
**2026-09-14 · accepted**

**Context.** Purity test P-1 requires the driver to export exactly five functions, but something has
to launch Chromium, navigate to the start URL and close the browser, and `docs/06` sketched
`driver.open()` and `driver.apply()` on the agent's side.

**Decision.** `driver/index.ts` exports only `axSnapshot`, `pressKey`, `typeText`, `focusInfo` and
`currentUrl`, each taking a `DriverSession` handle whose Playwright objects live in a private
`WeakMap`. `driver/session.ts`, used by the CLI and later the worker, opens and closes sessions and
binds the five functions into an `AgentDriver`. The agent loop receives only that `AgentDriver`; eslint
forbids `agent/` from importing `session`, `internal`, `cdp`, `stabilize` or `index`. The agent may
import the pure driver modules `serialize`, `hash`, `tree` and `types`.

**Rejected.** A driver class with `open()` on it, which hands the agent navigation. Returning the
Playwright page from `openSession`, which lets a later caller leak it.

**Consequence.** The agent cannot navigate, screenshot or evaluate even by accident, and the loop is
testable with a replay driver and no browser. Anything privileged, such as the Day 3 fiber lookup,
must go through `session.ts`-level code outside `agent/`.

---

## 11 · The provider interface carries whole requests, text only
**2026-09-14 · accepted**

**Context.** P-2 and P-3 assert what is *sent* to a model, so a spy must see the final prompt, not
just the inputs to it. The model also has to return reasoning and confidence for `step.decision`,
while the shared `AgentToolSchema` is strict.

**Decision.** `LlmProvider` has `narrate(request)` and `decide(request)`, each taking a complete
`ModelRequest` built in `agent/prompts.ts`. A `ModelRequest` can only hold text blocks. Model choice
lives in the adapter (`llm/anthropic.ts`, the only file allowed to import the SDK). Each tool's model
schema adds `reasoning` and `confidence`, which `agent/tools.ts` strips before validating the rest
against the shared schema.

**Rejected.** `narrate(transcript)` and `decide(goal, history)` with prompt assembly inside the
adapter, which would hide the real prompt from the purity spy and duplicate prompts per provider.

**Consequence.** Swapping providers means one adapter that maps text blocks and tool definitions.
Prompt caching is expressed as a `cache` flag on a block, which a provider without caching ignores.

---

## Template for the next entry

```md
## 12 · Title
**YYYY-MM-DD · accepted**

**Context.**
**Decision.**
**Rejected.**
**Consequence.**
```
