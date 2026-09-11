# 03 · User Flows

Four personas, six flows. Each flow lists the trigger, the steps, what the user sees, what the
system does, and where it can fail. Failure references point at entries in `09-FAILURE-MODES.md`.

## Personas

| Persona | Who | What they want |
|---|---|---|
| **Dev** | A frontend engineer shipping a feature | To know before merge whether they broke keyboard or screen-reader use |
| **Lead** | An engineering lead or compliance owner | Evidence, a trend, and something to show legal |
| **Ana** | A blind user who just hit a wall on a real site | To be heard, and for the wall to be gone next week |
| **Judge** | A hackathon judge, sighted, sceptical | To be shown the thing existing tools cannot do |

---

## Flow 1 — Run a goal against a URL (the core loop)

**Persona:** Dev · **Mode:** A or B · **Duration:** 30–90 seconds

```
 1. Dev opens /  and sees one form:
       URL            https://shop.example.com
       Goal           "complete checkout"
       GitHub repo    (optional) Webverse-Hackathon/ally-demo-shop
    Below the form: three example goals as one-click presets.

 2. Dev submits.
    -> POST /api/runs        validated by zod, URL checked against the SSRF deny list
    -> Run{status: QUEUED} persisted, job enqueued
    -> browser redirected to /live/<runId>

 3. /live/<runId> paints the split screen immediately:
       LEFT   an iframe of the target URL — what a sighted person sees
       RIGHT  an empty narration column, a step counter, a "speak aloud" toggle

 4. EventSource connects to /api/runs/<runId>/stream.
    First event is `run.started`. Left panel gets a dimmed overlay reading
    "the agent cannot see this".

 5. For each step the right column appends a card, and speechSynthesis speaks it:
       PERCEPTION   "banner. navigation. list, six items."
       PERCEPTION   "main. heading level one, Summer Sale."
       PERCEPTION   "image. image. image."
       PERCEPTION   "button. button. button. group. clickable."
       AGENT        "I cannot tell which control adds an item. Trying each."
       ACTION       Tab
       PERCEPTION   "dialog."  + a warning chip: focus remains behind the dialog
    Each card shows its step number and elapsed time. The step counter reads "7 of 20".

 6. The agent declares blocked.
    -> `run.blocked` event
    -> a red terminal card:
       "Goal abandoned at step 7 of 20.
        Blocker: unlabelled controls + focus not trapped."

 7. Two seconds later the axe comparison lands as `run.correlated`:
       "axe-core reported 14 rule violations on this page.
        Zero of them was the reason the agent could not check out."

 8. Buttons appear: [ View full report ]  [ Fix this ]  [ Re-run ]
    "Fix this" is enabled only in Mode A. In Mode B it is replaced by
    "Show suggested diff" with a tooltip explaining that no repo is connected.
```

**Failure points:** target site blocks headless browsers (F-03), page never reaches a stable AX
state (F-05), the agent loops instead of concluding (F-11), the LLM API times out mid-run (F-20),
the iframe refuses to embed because of `X-Frame-Options` (F-07).

---

## Flow 2 — Read the report

**Persona:** Dev or Lead · **Page:** `/run/[runId]`, server rendered, shareable

```
 1. Header
       Goal · URL · verdict badge (SUCCEEDED / BLOCKED / ABANDONED) · duration · model cost

 2. THE VERDICT BLOCK — the largest element on the page
       "axe reported 14 rule violations and zero of them was
        the reason the agent could not check out."
    Beneath it, two columns side by side:
       WHAT AXE FOUND              WHAT ACTUALLY STOPPED THE AGENT
       14 violations, listed       1 blocker, at step 7
       colour-contrast x9          unlabelled controls in the product grid
       image-alt x3                focus not trapped in the add-to-cart dialog
       region x2                   WCAG 4.1.2 Name, Role, Value  ·  2.4.3 Focus Order
    Violations that DID relate to the blocker are highlighted. Usually none. That is the point.

 3. THE TIMELINE
    Every step expandable: the raw transcript the agent received, the narration, the chosen
    action and its stated reasoning. A "replay with audio" button re-speaks the whole run.

 4. THE BLOCKER DETAIL
       The AX node, its accessible name (or the absence of one), its role, its DOM path,
       and — in Mode A — the source file and line, as a clickable GitHub permalink.

 5. THE FIX PANEL
       Mode A before fixing:  [ Generate fix and open a pull request ]
       Mode A after fixing:   the diff, the PR link, the verify-run result
       Mode B:                the suggested diff, with a note that it is unanchored and unverified

 6. Footer: raw JSON download, and the axe report as JSON. Evidence for the compliance owner.
```

**Failure points:** report requested while the run is still executing (render partial, keep the
stream open), a very long run makes the timeline heavy (paginate beyond 50 steps, F-16).

---

## Flow 3 — Generate the fix and open a pull request

**Persona:** Dev · **Mode:** A only · **Duration:** 15–40 seconds

```
 1. Dev clicks "Generate fix and open a pull request".
    -> POST /api/runs/<runId>/fix
    -> a progress strip appears with five stages, each ticking green in turn

 2. STAGE 1  Locate the source
       blocker AX node -> backendDOMNodeId -> DOM node -> data-ally-src attribute
       -> ProductCard.tsx:41-47
       If no attribute is present, fall back to the fiber, then to an AST search.
       An AST-search result shows a confidence score and asks the dev to confirm before continuing.

 3. STAGE 2  Read the context
       Fetch the file from the repo at the run's commit SHA. Extract a window of
       30 lines around the target. Never send the whole repository to the model.

 4. STAGE 3  Generate the patch
       The model receives: the source window, the blocker category, the WCAG criterion,
       the transcript line that exposed the problem, and a hard instruction to make the
       smallest correct change.

 5. STAGE 4  Validate — any failure sends it back to stage 3, up to three attempts
       applies cleanly · ts-morph parses · tsc --noEmit · jsx-a11y clean · <= 15 lines changed

 6. STAGE 5  Open the pull request
       branch  ally/fix-<runId>
       title   "a11y: label product controls and trap focus in the cart dialog"
       body    the before narration, the blocker, the WCAG criterion, the diff rationale,
               and a placeholder for the verify result
       -> the PR link appears on screen

 7. The verify run starts automatically against the patched build.
    The live view reopens on the right. The agent completes checkout in eleven steps.
    A green banner: "Verified. The goal now completes in 11 steps."
    A comment is posted on the pull request with the before and after transcripts.
```

**Failure points:** no `data-ally-src` because the target was a production build (F-30), the repo
moved on since the run and the line numbers are stale (F-31), the patch passes every gate and still
does not fix the blocker (F-33), the GitHub App lacks write permission (F-35), the preview
deployment is not ready when the verify run starts (F-36).

---

## Flow 4 — Barrier Report (the human-centered loop)

**Persona:** Ana · **Ships day 4, only if the core is solid**

```
 1. Ana opens /barrier. The page is keyboard-first and screen-reader-first by construction:
    one labelled textarea, one submit button, a live region for status. No modal, ever.

 2. She types, or dictates with the microphone button:
       "I can't submit the form on the pension page at gov.example/pensions.
        I tab to the end and there's no way to send it."

 3. -> POST /api/barriers
    An LLM extracts a structured intent from her sentence:
       { url: "https://gov.example/pensions",
         goal: "submit the pension application form",
         expectedFailure: "no reachable submit control by keyboard",
         assistiveTech: "screen reader + keyboard" }
    The extraction is shown back to her in plain language for confirmation.
    She can correct any field. Nothing runs until she confirms.

 4. On confirmation a normal run is created, tagged `source: BARRIER_REPORT`.

 5. Ally runs the goal. One of three outcomes:
       REPRODUCED     the agent hits the same wall -> Ana's report is now evidence
       NOT REPRODUCED the agent succeeds -> we tell her honestly, and ask for more detail.
                      This is a real outcome, not a failure to hide.
       DIFFERENT WALL the agent is blocked somewhere else -> both are reported

 6. If reproduced and the site is repo-connected, the fix flow runs automatically and the
    pull request credits the report: "Reported by a user of this site via Ally Barrier Report."
    If the site is not repo-connected, we produce a shareable report page she can send to
    the site owner — a reproducible run, not an unprovable complaint.

 7. Ana gets a status page. When the pull request merges, the page updates.
```

**Why this matters for judging:** it inverts the usual power relationship. The disabled user stops
being an unreproducible bug report and becomes the source of truth. Say exactly that on stage.

**Failure points:** the extraction guesses the wrong URL (always confirm before running, never
auto-run, F-40), the page is behind a login (F-41), speech input is unsupported in the browser
(degrade to text, never block, F-42).

---

## Flow 5 — Run in CI on every pull request

**Persona:** Lead · **The impact story**

```
 1. The team adds .github/workflows/ally.yml and a repository secret.
 2. A pull request opens. The workflow waits for the preview deployment URL.
 3. It calls POST /api/runs for each goal listed in ally.config.json:
       ["complete checkout", "sign up for an account", "search and filter products"]
 4. Each run executes against the preview URL with the PR head SHA attached.
 5. Ally posts one PR comment:
       ✅ complete checkout            11 steps
       ❌ sign up for an account       blocked at step 4 — unlabelled email input
       ✅ search and filter products    7 steps
    with a link to each report.
 6. The check fails the build if any goal regresses from the base branch. Goals that were
    already failing on the base branch are reported but do not fail the build, so a team can
    adopt Ally without a red pipeline on day one. That ratchet is the adoption story.
```

**Failure points:** the preview URL is not ready (poll with a timeout, F-36), runs are
non-deterministic and flap between pass and fail (F-12 — this is the hardest problem in the
product, and the mitigation is the recorded-fixture replay mode).

---

## Flow 6 — The judge's path on demo day

**Persona:** Judge · Covered second by second in `11-DEMO-SCRIPT.md`

```
 1. Judge sees the target site rendered normally on the left. It looks clean and modern.
    Their prior: "this site is fine."
 2. Audio starts. They hear "image. image. image. button. button. button."
    The prior breaks. This is the beat the whole project is built around.
 3. The agent gives up at step 7, out loud.
 4. We show the axe report: 14 violations, none of them the blocker.
 5. Click Fix. A real pull request opens on a real repository, on screen.
 6. Re-run. Checkout completes in eleven steps, narrated.
 7. Last slide: Barrier Report, and the compliance deadlines that make this a market.
```

---

## Navigation map

```
/                       landing + run form
/live/[runId]           split screen, live narration, audio
/run/[runId]            full report, shareable, server rendered
/run/[runId]/fix        fix progress and diff (can also render inline on the report)
/barrier                barrier submission
/barrier/[id]           status page for a submitted barrier
/runs                   run history list (nice to have, day 4)
```

## The dashboard's own accessibility contract

We are shipping an accessibility product. Every page above must:

- reach every control with the keyboard alone, in a sensible order
- label every control with a real accessible name
- announce run status changes through an `aria-live` region
- trap focus in any dialog, and return focus on close
- pass an axe scan in CI with zero violations
- never rely on colour alone to convey the verdict

If our own dashboard fails an Ally run, we lose the room. So a nightly job runs Ally against Ally.
