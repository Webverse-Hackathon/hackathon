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

## 12 · Model calls may go through an Anthropic-compatible gateway
**2026-09-14 · proposed** · the probe failed for Agent Router (F-77); the base-URL mechanism stays

**Context.** The team has no Anthropic account key, so the Day 1 gate cannot run. A key for a
third-party router (Agent Router) is available.

**Decision.** `ANTHROPIC_BASE_URL` in config, validated as a URL and passed explicitly to the SDK
client in `llm/anthropic.ts`. Empty means `api.anthropic.com`. The adapter always passes a base URL,
so a stray shell variable cannot redirect traffic around config. The CLI prints which host it is using.

**Rejected.** A new OpenAI-format adapter: more code, and only needed if the gateway cannot speak the
Anthropic Messages API. Relying on the SDK's implicit `ANTHROPIC_BASE_URL` read: invisible in config.

**Models.** Agent Router serves no Sonnet or Haiku, so through it: decide `claude-opus-5` (adaptive
thinking by default, effort `low`) and narrate `claude-opus-4-8` (no thinking unless asked, so narration
stays quick). Both are $5/$25 per million tokens: about 2.5x Sonnet 5 on decide and 5x Haiku on narrate.
Both reject `temperature`, so narrate sends no sampling parameters on any model (F-72). The defaults in
config stay as #3 for the official API; the gateway models are set in `.env`.

**Consequence.** Accepted only if the gateway handles everything `decide` sends: adaptive thinking,
`output_config.effort`, strict tools with `disable_parallel_tool_use`, and `cache_control`. Model names
must be ones the gateway serves. Prompts, including page text, go to that third party. Costs in
`llm/cost.ts` assume Anthropic prices and may not match the gateway's bill.

---

## 13 · Demo build: one process, runs in memory, no Postgres, Redis or BullMQ
**2026-09-14 · accepted** · departs from docs/01 (worker, queue, Postgres) and #8 (deploy)

**Context.** The live demo is an online meeting on 2026-09-15, the day after Phase 1 landed, and Days
2 to 5 were not started. The rubric weights concept and architecture 50%, and the working prototype and
its design 30%. Four days of roadmap do not fit in one.

**Decision.** For the demo, `backend/src/api/server.ts` is a single Fastify process that also runs the
agent (`backend/src/runs/`). Runs, their event logs and their reports live in memory, and the SSE stream
replays from that log with `Last-Event-ID`. The left panel shows JPEG frames from the agent's own browser
session (`backend/src/preview/`), fetched by the UI from a separate endpoint and never passed to
`agent/`. axe runs at load and at the stopping point, and the correlation is computed, not scripted. The
fix flow maps the blocker to JSX by AST search, has the decision model write the patch, runs the gates,
and verifies against a patched copy in `fixtures/fixed-shop`. Presented on a local machine by screen share.

**Rejected.** Building the documented architecture partially: a half-wired queue demos worse than a
working single process. Scripting the transcript or the verdict: that would be the demo lie the purity
suite exists to prevent.

**Consequence.** Runs vanish on restart, there is no horizontal scale, and a crashed browser can take
down the API. The documented architecture stays the answer to "how does this scale" in Q&A and is still
the post-hackathon plan. Known debt, recorded in `PROGRESS.md`.

---

## 14 · The demo's pull requests use a token, not the GitHub App
**2026-09-14 · accepted** · departs from docs/01 security boundaries ("never a personal access token")

**Context.** The GitHub App does not exist and cannot be created and installed before the demo.

**Decision.** `github/pull-request.ts` uses Octokit with `GITHUB_TOKEN` and `GITHUB_REPO` from `.env`,
one commit per fix lineage, and refuses to push when the repository's file differs from the code that was
tested. Without both settings the PR stage is reported as skipped and the validated diff is shown instead.

**Rejected.** Faking a pull request in the UI. Skipping the stage silently.

**Consequence.** A token scoped by its owner, not by installation. Replace with App auth after the hackathon.

---

## 15 · Free OpenRouter models through an OpenAI-compatible adapter, one call per step
**2026-09-14 · accepted** · refines #3 and #12

**Context.** Agent Router refuses Ally as a client (F-77). The team wants free models. OpenRouter's free
variants allow 20 requests per minute and 50 per day (1000 once $10 of credits has been bought, F-78). Groq's
free tier allows 8K tokens per minute on its tool-capable models, less than two decision requests.

**Decision.** `llm/openai-compatible.ts` (fetch, no SDK) behind `ALLY_LLM_PROVIDER=openai-compatible`, built by
`llm/factory.ts`. Decide with `nvidia/nemotron-3-ultra-550b-a55b:free` (tools and reasoning, 1M context), with
`nvidia/nemotron-3-super-120b-a12b:free` as the fallback if it is slow or unavailable. `tool_choice: required`,
reasoning effort low. `ALLY_NARRATION=decision` speaks the decision's reasoning through the same F-18 guard, so a
step costs one request instead of two; the event order is unchanged. Anthropic stays the default.

**Rejected.** Groq (token-per-minute cap). `openrouter/free`, which routes to a different model per request and
would make runs disagree (F-12). Impersonating an approved client on Agent Router.

**Update, same day.** The live probe found both Nvidia free endpoints overloaded and Gemma rate limited (F-79). The decision setting is now a fallback list across providers, `nvidia/nemotron-3-super-120b-a12b:free,google/gemma-4-31b-it:free,nex-agi/nex-n2.5-pro:free`, and tool calls written as text are recovered.

**Consequence.** Weaker, slower tool calling than Claude, and free endpoints can queue or disappear. Narration
describes intent ("I move on because…") rather than what was heard. A full demo (run, fix, verify) is roughly 30
requests, so the 50-per-day cap allows about one rehearsal. Chosen models are unverified until the probe runs.

---

## 16 · Kimi K3 on NVIDIA NIM's free trial endpoint
**2026-09-14 · accepted** · supersedes the model and host choice in #15; the adapter and one-call-per-step stay

**Context.** OpenRouter's free tier allows 50 requests a day (F-78), about one rehearsal, and its free Nemotron
endpoints were overloaded on the live probe (F-79). A first real run took 5.4 minutes. NVIDIA's hosted catalog
(build.nvidia.com) serves `moonshotai/kimi-k3` free: about 1M context, function calling, structured output,
reasoning effort low, high or max. The trial is limited to about 40 requests a minute per key across all models, with no
daily cap published.

**Decision.** `ALLY_OPENAI_COMPAT_BASE_URL=https://integrate.api.nvidia.com/v1`, decide and narrate
`moonshotai/kimi-k3`, reasoning effort `low`, `ALLY_NARRATION=decision`, step timeout 60 s for a thinking model.
There is one model, not a fallback list: NIM has no server-side router, and one model keeps runs consistent (F-12).
The adapter reads NIM's problem-details errors and downgrades `tool_choice` to `auto` if `required` is refused (F-80).

**Rejected.** Staying on OpenRouter free (daily cap). Kimi K3 through Moonshot or OpenRouter paid ($3 input and $15
output per million tokens): about $0.30 to $0.60 per full demo, fine later, but it needs billing set up tonight.

**Consequence.** It costs $0 but falls under the NVIDIA API Trial Terms: prototyping and evaluation, not production,
so it is fine for the demo and must be replaced before real users. Prompts, including page text, go to NVIDIA.
`llm/cost.ts` has no price for `moonshotai/kimi-k3`, so a run's cost shows as unknown rather than a false zero. A
40-per-minute limit shared by the key caps the number of runs at once. Unverified until the probe runs with the key.

---

## 17 · Bynara (NaraRouter) free plan, StepFun 3.7 Flash with Tencent Hy3 as fallback
**2026-09-15 · accepted** · supersedes the host and model choice in #16; the adapter and one-call-per-step stay

**Context.** Kimi K3 on NVIDIA NIM's trial was slow enough that steps timed out. With 4 retries and a 60 s
per-call timeout, one stuck step could hang for about five minutes. Groq's free tier was reconsidered and rejected
again: 8K tokens per minute is about one decision request (#15). The team chose Bynara's OpenAI-compatible gateway,
`https://router.bynara.id/v1`.
Its public plans endpoint (`/api/plans`) lists the free plan as 15 requests per minute and 7M tokens a day, with
`agnes-2.5-flash`, `laguna-s-2.1`, `stepfun-3.7-flash` and `tencent-hy3-free`.

**Decision.** Decide with `stepfun-3.7-flash,tencent-hy3-free`: the adapter rotates the list on each retry, including on
hosts other than OpenRouter. Narrate with `stepfun-3.7-flash`. Reasoning effort `low` (the gateway accepts `reasoning_effort`),
step timeout 30 s (a flash model should answer well inside it, and a stuck call fails over sooner), one run at a time
(15 requests a minute), `ALLY_NARRATION=decision`.

**Rejected.** `laguna-s-2.1` and `agnes-2.5-flash` as the first choice: less known for general tool-calling agents.
Groq free tier (token-per-minute cap). Staying on NIM (latency).

**Consequence.** Tool calling on these models is unverified until a probe runs with an `sk-nry-` key. If
`tool_choice: required` is refused, the F-80 downgrade to `auto` and text recovery apply. Free model ids have no
`:free` suffix, so `llm/cost.ts` reports their cost as unknown. Prompts, including page text, go to a third-party
gateway. 15 requests a minute can throttle a fast run; 429s are retried with backoff.

---

## 18 · A cart count heard rising confirms an add-to-cart goal
**2026-09-15 · accepted** · widens the evidence `confirmSuccess` accepts (F-13); nothing else about F-13 changes

**Context.** Live run `0afd9f00` on the patched shop: the agent heard "Cart (0)", pressed Enter on "Add Blue linen shirt to
cart", moved back and heard "Cart (1)". A blind user would know the shirt was added. The confirmation accepted only a
past-tense heading, status or alert, or a confirming URL, and it never looked at the goal. So the run was downgraded to
`BLOCKED / UNKNOWN`, and Fix chased a live-region patch nobody needed. It also meant a verify run of an add-to-cart
goal could never reach "Goal completed" on a site that does not announce the change.

**Decision.** `agent/confirm.ts` also accepts a rising cart count, under all of these conditions. The goal asks to add,
put or place something in a cart, bag, basket or trolley. The count is read from a button, link, status, alert or
announcement the agent perceived at this step or the one before, never from the model's evidence text. An Enter or
Space was pressed after the last reading, and the count is higher than that reading. The injection refusal still
comes first. If nothing announced the change, the run still succeeds, and the evidence records that the user had to
go and find the count (WCAG 4.1.3 Status Messages), like `MEANINGLESS_NAME`: degraded, not blocked.

**Rejected.** Trusting any "Cart (n)" line: a cart that starts at 1 would confirm with no action. Leaving the rule strict:
it reports sites a blind user can complete as blocked, which is the opposite of the premise. A general "any control's
name changed" rule: too loose to be safe from hallucinated success before the demo.

**Consequence.** Ally cannot tell which item was added, only that the count rose after an activation. The 4.1.3 note
lives in the evidence string, shown on the live view. The report has no separate field for it yet.

---

## 19 · A third planted blocker: the newsletter confirmation is not announced
**2026-09-15 · accepted** · overrides the "do not add a third blocker" rule in `fixtures/broken-shop/README.md`, at the
user's request

**Context.** A live run of "subscribe to the newsletter" was blocked, and Fix stopped at locate. The newsletter was
noise only: Subscribe had no handler, so no patch and no re-run could ever succeed. The user wants that goal to go
through the whole flow: blocked, located, patched, gated, re-run, succeeded.

**Decision.** Subscribe sets state, and `<p className="newsletter-status">` shows "Thanks, you are subscribed." with no
live region: WCAG 4.1.3, `STATE_NOT_ANNOUNCED`. The fix is `role="status"` on that paragraph. The unlabelled inputs stay
as axe noise. Tab order and the checkout blockers are unchanged.

**Rejected.** Making the newsletter accessible outright: the goal would succeed with nothing to fix. Putting the
confirmation where the button is: it would move focus and hide the barrier. Lowering
`LOCATE_CONFIDENCE_THRESHOLD`: decision 7 gates AST search at 0.8, and the button was the wrong target anyway (F-84).

**Consequence.** The fixture has three blockers. The checkout demo is untouched, but the demo freeze (F-51) now needs
this change in it. Found by searching for a confirmation near the node, so Ally still cannot fix an unannounced result
that is far from the control or worded outside `CONFIRMATION_TEXT`.

---

## Template for the next entry

```md
## 20 · Title
**YYYY-MM-DD · accepted**

**Context.**
**Decision.**
**Rejected.**
**Consequence.**
```
