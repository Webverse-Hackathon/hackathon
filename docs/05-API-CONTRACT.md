# 05 · API Contract

Base URL: `/api`. Everything is JSON except the SSE stream. Every request and response body has a
zod schema in `packages/shared/src/schemas.ts`, and Fastify derives both validation and the OpenAPI
document from those schemas. **If a shape is not in the shared package, it does not exist.**

## Conventions

- IDs are cuid strings.
- Timestamps are ISO 8601 UTC.
- Errors use the shape below, always, including validation failures.

```jsonc
{
  "error": {
    "code": "INVALID_URL",          // stable, machine-readable
    "message": "Private network addresses are not allowed.",
    "details": { "field": "url" }   // optional
  }
}
```

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 400 | zod rejected the body |
| `INVALID_URL` | 400 | not http/https, or resolves to a private range |
| `RUN_NOT_FOUND` | 404 | |
| `RUN_NOT_BLOCKED` | 409 | tried to fix a run that is not `BLOCKED` |
| `REPO_NOT_CONNECTED` | 409 | tried to fix a Mode B run |
| `PATCH_VALIDATION_FAILED` | 422 | three attempts, all rejected by the gates |
| `GITHUB_PERMISSION_DENIED` | 403 | the app lacks write access |
| `RATE_LIMITED` | 429 | includes `Retry-After` |
| `UPSTREAM_TIMEOUT` | 504 | the target site or the model provider |

---

## `POST /api/runs`

Create and enqueue a run.

**Request**

```jsonc
{
  "url": "https://shop.example.com",
  "goal": "complete checkout",
  "stepBudget": 20,                       // optional, 1..50, default 20
  "source": "MANUAL",                     // MANUAL | CI | BARRIER_REPORT
  "repo": {                               // optional — presence selects Mode A
    "owner": "Webverse-Hackathon",
    "name": "ally-demo-shop",
    "commitSha": "a1b2c3d",               // optional, defaults to the default branch head
    "branch": "main"
  }
}
```

**Response `201`**

```jsonc
{
  "id": "clx8f0...",
  "status": "QUEUED",
  "mode": "REPO_CONNECTED",
  "streamUrl": "/api/runs/clx8f0.../stream",
  "liveUrl": "/live/clx8f0...",
  "createdAt": "2026-09-11T10:04:00.000Z"
}
```

**Validation rules**

- `url` must be `http:` or `https:`. After DNS resolution it must not land in a private,
  loopback, link-local or metadata range. See F-01 in `09-FAILURE-MODES.md`.
- `goal` is 3 to 200 characters and must describe an outcome, not a set of instructions. A goal of
  *"click the third button"* is rejected with a hint, because it defeats the premise.
- `repo` requires the GitHub App to be installed on that repository, checked at creation time so the
  failure surfaces before the run rather than after it.

---

## `GET /api/runs/:id`

The full report object. This is what `/run/[id]` renders on the server.

**Response `200`**

```jsonc
{
  "id": "clx8f0...",
  "url": "https://shop.example.com",
  "goal": "complete checkout",
  "status": "BLOCKED",
  "mode": "REPO_CONNECTED",
  "stepsUsed": 7,
  "stepBudget": 20,
  "durationMs": 41230,

  "verdict": "axe reported 14 rule violations and zero of them was the reason the agent could not check out.",
  "axeViolationCount": 14,
  "blockerCaughtByAxe": false,

  "blocker": {
    "atStep": 7,
    "category": "UNLABELLED_CONTROL",
    "summary": "Three product controls have no accessible name, and the add-to-cart dialog does not move or trap focus.",
    "agentReasoning": "I cannot tell which control adds an item. After opening what announced itself only as 'dialog', focus stayed on the page behind it, so I could not reach any control inside it.",
    "role": "button",
    "accessibleName": null,
    "domPath": "main > div.grid > article:nth-child(1) > div > button",
    "htmlSnippet": "<button class=\"add\"><svg .../></button>",
    "wcagCriteria": ["4.1.2", "2.4.3"],
    "source": {                          // Mode A only, present after the fix flow locates it
      "filePath": "components/ProductCard.tsx",
      "lineStart": 41,
      "lineEnd": 47,
      "permalink": "https://github.com/.../blob/a1b2c3d/components/ProductCard.tsx#L41-L47",
      "locateMethod": "data-attribute",
      "locateConfidence": 1.0
    }
  },

  "axeFindings": [
    {
      "phase": "load",
      "ruleId": "color-contrast",
      "impact": "serious",
      "wcagTags": ["wcag2aa", "wcag143"],
      "description": "Elements must meet minimum colour contrast ratio thresholds",
      "targetSelector": ".price-note",
      "relatedToBlocker": false
    }
    // ... 13 more
  ],

  "steps": [ /* see the step shape below */ ],

  "patch": null,
  "pullRequest": null,
  "verifyRun": null,

  "cost": { "inputTokens": 48210, "outputTokens": 3120, "usd": "0.184320" }
}
```

**Step shape**

```jsonc
{
  "index": 4,
  "kind": "PERCEPTION",
  "transcript": [
    { "role": "button", "name": null,  "states": [], "spoken": "button." },
    { "role": "button", "name": null,  "states": [], "spoken": "button." },
    { "role": "group",  "name": null,  "states": ["clickable"], "spoken": "group. clickable." }
  ],
  "narration": "I hear three unnamed buttons and a clickable group.",
  "axStateHash": "9f2c...",
  "latencyMs": 820
}
```

---

## `GET /api/runs/:id/stream` — Server-Sent Events

The live narration feed. Supports `Last-Event-ID` for reconnect replay, so a dropped connection
mid-demo recovers without losing lines.

```
event: run.started
data: {"runId":"clx8f0...","url":"https://shop.example.com","goal":"complete checkout","stepBudget":20}

event: step.perception
data: {"index":1,"lines":[{"spoken":"banner."},{"spoken":"navigation."},{"spoken":"list, six items."}],"speak":true}

event: step.narration
data: {"index":1,"text":"A banner, a navigation landmark, and a list of six items."}

event: step.decision
data: {"index":1,"tool":"press_key","input":{"key":"Tab"},"reasoning":"Move into the page to find interactive controls.","confidence":0.9}

event: step.action
data: {"index":1,"result":"focus moved to link, Skip to content","latencyMs":140}

event: run.blocked
data: {"atStep":7,"category":"UNLABELLED_CONTROL","summary":"...","wcagCriteria":["4.1.2","2.4.3"]}

event: run.correlated
data: {"axeViolationCount":14,"blockerCaughtByAxe":false,"verdict":"axe reported 14 rule violations and zero of them was the reason the agent could not check out."}

event: run.finished
data: {"status":"BLOCKED","stepsUsed":7,"durationMs":41230,"reportUrl":"/run/clx8f0..."}
```

**Event catalogue**

| Event | When | Frontend behaviour |
|---|---|---|
| `run.started` | worker picks up the job | paint the split screen, dim the left panel |
| `step.perception` | after each AX snapshot | append a card, speak each line if audio is on |
| `step.narration` | after the narration model returns | append the agent's voice line |
| `step.decision` | after the decision model returns | show the chosen key and the reasoning |
| `step.action` | after the keystroke lands | show the result, update the focus indicator |
| `step.warning` | a soft anomaly, e.g. focus did not move | amber chip on the step card |
| `run.blocked` | the agent gave up | red terminal card, reveal the action buttons |
| `run.succeeded` | the goal was reached | green terminal card |
| `run.correlated` | both axe phases complete | the verdict banner — the headline moment |
| `run.errored` | our fault | error card with a retry button |
| `run.finished` | always last | close the stream, enable navigation to the report |

**Heartbeat:** a `: keepalive` comment every fifteen seconds, so an idle connection is not culled by
the load balancer. See F-21.

---

## `POST /api/runs/:id/fix`

Mode A only. Runs the locate → generate → validate → pull request pipeline. Returns immediately and
reports progress on the same SSE stream under `fix.*` events.

**Response `202`**

```jsonc
{ "runId": "clx8f0...", "status": "FIXING", "streamUrl": "/api/runs/clx8f0.../stream" }
```

**Fix events**

```
event: fix.stage      data: {"stage":"locate","status":"running"}
event: fix.located    data: {"filePath":"components/ProductCard.tsx","lineStart":41,"lineEnd":47,"method":"data-attribute","confidence":1.0}
event: fix.generated  data: {"diff":"--- a/...","linesChanged":4,"rationale":"..."}
event: fix.validated  data: {"passed":true,"gates":{"appliesCleanly":true,"parses":true,"typechecks":true,"jsxA11y":true,"sizeOk":true},"attempts":1}
event: fix.pr         data: {"number":12,"url":"https://github.com/.../pull/12","branch":"ally/fix-clx8f0"}
event: fix.verifying  data: {"verifyRunId":"clx9a1...","liveUrl":"/live/clx9a1..."}
event: fix.verified   data: {"success":true,"stepsUsed":11,"before":7,"after":11}
event: fix.failed     data: {"stage":"validate","reason":"three attempts failed the typecheck gate","suggestedDiff":"..."}
```

`fix.located` with `confidence < 0.8` pauses and waits for `POST /api/runs/:id/fix/confirm` before
continuing. We never patch a file we are not confident we identified.

---

## `POST /api/runs/:id/rerun`

Re-queues the same URL, goal and step budget as a fresh run. Used by the demo and by the verify
flow. Returns the same shape as `POST /api/runs`.

---

## `POST /api/barriers`

Barrier Report intake. Two phases, because we never run anything the reporter has not confirmed.

**Phase 1 — submit**

```jsonc
{
  "rawText": "I can't submit the form on the pension page at gov.example/pensions. I tab to the end and there's no way to send it.",
  "inputMethod": "spoken",
  "contactEmail": "ana@example.com"     // optional
}
```

**Response `201`** — the extraction, in plain language, for confirmation:

```jsonc
{
  "id": "clxb2...",
  "extraction": {
    "url": "https://gov.example/pensions",
    "goal": "submit the pension application form",
    "expectedFailure": "no reachable submit control by keyboard",
    "assistiveTech": "screen reader + keyboard"
  },
  "confirmPrompt": "I will open gov.example/pensions and try to submit the pension application form using only a keyboard and a screen reader. Is that right?",
  "confirmed": false
}
```

**Phase 2 — `POST /api/barriers/:id/confirm`**

```jsonc
{ "url": "https://gov.example/pensions", "goal": "submit the pension application form" }
```

Any field the reporter corrected is sent back. Only now is a run created.

**Response `200`**

```jsonc
{ "id": "clxb2...", "runId": "clxb3...", "liveUrl": "/live/clxb3..." }
```

## `GET /api/barriers/:id`

Status page data: the original words, the extraction, the run outcome
(`REPRODUCED` / `NOT_REPRODUCED` / `DIFFERENT_WALL` / `PENDING`), and the pull request if one exists.

---

## `GET /api/runs`

Paginated history. Query: `?status=&repo=&limit=20&cursor=`. Returns a slim run summary list, not
full reports.

## `GET /api/health`

`{ "status": "ok", "db": "ok", "redis": "ok", "queueDepth": 0, "browserPoolFree": 2 }`
Used by the ALB target group health check and by the demo-day preflight script.

## `POST /api/github/webhook`

Receives `pull_request` events so we can update `PullRequest.state` when an Ally pull request merges
or closes, which in turn updates any barrier report status page. Signature verified with the
webhook secret; unsigned requests are rejected before the body is parsed.

## Rate limits

| Scope | Limit |
|---|---|
| `POST /api/runs` per IP | 10 per hour |
| `POST /api/barriers` per IP | 5 per hour |
| Concurrent runs, global | 4 (the browser pool size) |
| SSE connections per run | 20 |

Demo day runs with a bypass token in the environment so our own stage traffic is never throttled.
That token is in the demo preflight checklist in `11-DEMO-SCRIPT.md`.
