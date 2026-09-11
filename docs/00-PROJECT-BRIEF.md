# 00 · Project Brief

## The product

**Ally** is an agent that tries to use your website the way a blind person does — keyboard only,
screen reader only — and tells you the exact step where it gave up.

You give it a URL and a goal in plain English: *"book an appointment."* Playwright opens the page,
but Ally is **denied the screenshot**. It receives only the accessibility tree — the same text
stream a screen reader speaks — and may only send keystrokes. No coordinates, no vision.
That constraint is the simulation.

## The problem, in numbers

| Metric | Value | Direction |
|---|---|---|
| Top 1M home pages failing automated WCAG checks (WebAIM Million 2026) | 95.9% | up from 94.8%, reversing six years of improvement |
| Average accessibility errors per page | 56.1 | up 10% year on year |
| Pages with low-contrast text | 83.9% | — |
| Pages with missing image alt text | 53.1% | — |
| Pages with unlabelled form inputs | 51.0% | — |
| Developers using AI to write code | 84% | — |
| Developers who do not trust its output | 46% | — |
| People living with significant disability | ~1.3 billion | — |

Generated UI code is inaccessible by default. Models produce `<div onClick>` where a `<button>`
belongs, because that is what the training data looks like. The web is getting *less* usable for
disabled people in the same year that AI writes most of it.

## Why existing tools do not fix it

axe, Lighthouse and WAVE are **rule checkers**. They inspect the page at rest and report violations
of written rules. They catch roughly a third of real WCAG problems, and they are structurally blind
to the failures that actually strand a human being:

- Alt text that exists but says `image_04.png`. The rule passes; the user learns nothing.
- A focus order that is technically valid but jumps header → footer → back.
- ARIA that is syntactically perfect and semantically wrong — a modal that never announces itself.
- A checkout that is fully labelled and still impossible to finish without a mouse.

Catching those needs a human tester who actually uses a screen reader. That testing is rare and
expensive, so it does not happen. **The gap between "passes the linter" and "a person can complete
the task" is the entire product.**

## The headline result

We run axe-core as a baseline alongside every agent run. The number we put on stage is the **diff**:

> *"axe reported 14 rule violations and zero of them was the reason the agent could not check out."*

This is computed, not asserted. See the Blocker Correlation section of `01-ARCHITECTURE.md`.

## Judging rubric and how we earn each part

| Criterion | Weight | How Ally earns it |
|---|---|---|
| **Innovation** | 25% | Nobody else will build an outcome-based accessibility agent. Reframing linting as task completion is a new angle and takes one sentence to explain. |
| **Technical** | 25% | Browser automation constrained to the a11y tree; an agent loop with real failure states; source-mapping a DOM node back to a JSX line; automated PR generation; re-run verification. Visibly hard. |
| **Problem solving** | 20% | We can state precisely what existing tools miss and **demonstrate the miss live** on a real site. Strongest possible answer to the judge's favourite question. |
| **Impact** | 10% | Runs in CI on every pull request, so it scales as a check, not a service. The European Accessibility Act and ADA Title II obligations landed 2025–26 — there is a paying market the day after. |
| **Presentation & demo** | 10% | The split screen with live speech synthesis. A genuine emotional beat, not a slide. See `11-DEMO-SCRIPT.md`. |
| *(remaining 10%)* | 10% | Allocated by the organisers — assume polish, documentation and completeness. This repo is part of that answer. |

## The human-centered half: Barrier Report

A second, smaller loop. A disabled user who hits a wall on any site describes it in their own
words — typed or spoken — *"I can't submit the form on the pension page."* Ally turns that sentence
into a reproducible run, confirms the blocker, and files it to the team with the patch attached.

**The disabled user stops being a bug report nobody can reproduce and becomes the source of truth.**

Build the agent first. Barrier Report lands on day four **only if the core is solid**. It is in the
deck from day one regardless — it is what turns a devtool into a system where the excluded person
finally gets heard.

## Scope decision: what Ally can actually patch

Confirmed with the team (see `DECISIONS.md` #4). Two modes:

- **Mode A — repo-connected.** URL *and* a GitHub repo. Full pipeline: audit → blocker → JSX line →
  real pull request → re-run on the patched build. This is the demo.
- **Mode B — URL only.** Any public site. Full pipeline *except* the PR: audit → blocker →
  suggested diff, unanchored. This is what proves the axe comparison on a real-world site.

We ship a deliberately broken storefront in `fixtures/broken-shop` and deploy it as the Mode A
target, so the pull request opened on stage is genuine.

## Non-goals

- We are **not** replacing axe. We run it, we cite it, we position against it. Ally is the layer above.
- We are **not** claiming to replace human accessibility testers. We are claiming to make the
  cheapest 80% of that testing continuous instead of annual.
- We are **not** auto-merging. Ally opens a pull request; a human reviews it.
