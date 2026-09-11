# 07 · Source Mapping and Patch Generation

The chain from *"the agent got stuck here"* to *"this is the line of code"* to *"here is the pull
request". This is the part judges will assume is fake. It has to be real, and it has to be
explainable in thirty seconds.

## The chain

```
Blocker
  └─ axNodeId                  from the transcript line the agent pointed at
      └─ backendDOMNodeId      from CDP Accessibility.getFullAXTree
          └─ DOM node          CDP DOM.resolveNode / DOM.getOuterHTML
              └─ source hint   data-ally-src="components/ProductCard.tsx:41:7"
                  └─ file + line range
                      └─ 30-line source window fetched from the repo at the run's commit SHA
                          └─ LLM-generated minimal unified diff
                              └─ five validation gates
                                  └─ branch, commit, pull request
                                      └─ verify re-run on the patched build
```

The only genuinely uncertain link is source hint. Everything else is a deterministic lookup.

## Strategy 1 — the `data-ally-src` attribute (primary)

A Babel plugin stamps every JSX element with its origin at build time.

```js
// infra/babel/ally-source-plugin.js  (conceptually — the real file lives in the target repo)
// JSXOpeningElement visitor: add data-ally-src="<relative path>:<line>:<column>"
// Skip Fragments and any element that already has the attribute.
// Gate on process.env.ALLY_SOURCE === '1' so production builds are unaffected by default.
```

Wiring it into the fixture site and into any Next.js target:

```js
// next.config.js in the TARGET repo
const withAllySource = process.env.ALLY_SOURCE === '1';
module.exports = {
  experimental: { swcPlugins: withAllySource ? [['ally-source-swc', {}]] : [] },
};
```

**Why this is the primary strategy:** it is deterministic, it survives minification, it works
through any framework that compiles JSX, and the lookup is a single attribute read. A judge asking
*"how do you know which line?"* gets a one-sentence answer with the attribute visible on screen.

**What it costs:** the target repository must opt in with one build flag. That is exactly the
Mode A boundary from `DECISIONS.md` #4, and it is honest — we say out loud that Ally patches repos
that connect to it, and audits everything else.

**For the demo:** `fixtures/broken-shop` is built with `ALLY_SOURCE=1`. The attribute will be
visible in the DOM inspector if a judge asks to see it. Let them look.

## Strategy 2 — React fiber debug source (fallback)

React attaches a fiber to every host DOM node under a key like `__reactFiber$abc123`. In
development builds that fiber carries `_debugSource` with `fileName`, `lineNumber` and
`columnNumber`.

```ts
// evaluated in the page, on the resolved DOM node, only during the fix flow
const key = Object.keys(node).find(k => k.startsWith('__reactFiber$'));
const src = key ? (node as any)[key]?._debugSource : null;
// { fileName: "/app/components/ProductCard.tsx", lineNumber: 41, columnNumber: 7 }
```

Free when the target is a React development server, which covers the local-development and
preview-deployment cases. Absent in production builds, and React may remove it in future versions,
so it is a fallback and never the thing we demo.

Note the ordering rule: this evaluation runs **after** the agent loop has finished, in the fix
flow, never during the run. The agent itself must never touch `page.evaluate`, or the constraint is
broken. This is enforced by module boundaries — `sourcemap/` imports the driver's privileged
interface, `agent/` cannot.

## Strategy 3 — ts-morph AST search (last resort)

When neither hint exists, we search the repository.

1. Clone or fetch the repo at the run's commit SHA into a temp directory.
2. Build a ts-morph project over `**/*.{tsx,jsx}`.
3. Collect every JSX element whose tag maps plausibly to the blocker's role — `button`, `a`,
   `input`, `dialog`, or a component name matching a known-component heuristic.
4. Score each candidate against the blocking node:

   | Signal | Weight |
   |---|---|
   | Matching literal text content | 0.35 |
   | Matching class name literal | 0.25 |
   | Matching attribute set, such as an `onClick` with no `aria-label` | 0.20 |
   | Matching sibling structure and count | 0.15 |
   | File path resembling the DOM path's component names | 0.05 |

5. Return the top candidate with its score as `locateConfidence`.

**Below 0.8 confidence we stop and ask the human.** The fix flow emits `fix.located` and waits for
`POST /api/runs/:id/fix/confirm`. Patching a file we guessed at is worse than not patching.

## The patch prompt

`backend/src/patch/generate.ts`. What the model receives, and nothing more:

- The 30-line source window, with the target lines marked.
- The blocker category and its one-sentence summary.
- The WCAG success criterion, by number and name.
- The exact transcript line that exposed the problem, e.g. `button.` with no name.
- The file's import block, so it can tell whether a helper already exists.

What it is told:

> Make the smallest change that lets a screen-reader user complete the goal. Do not refactor. Do not
> rename. Do not reformat. Do not add comments. Do not change styling. Prefer a native semantic
> element over an ARIA attribute. Return a unified diff and one sentence of rationale, nothing else.

"Prefer a native element over an ARIA attribute" matters: the correct fix for `<div onClick>` is
`<button>`, not `role="button" tabIndex={0}`. First rule of ARIA. If Ally generates bad accessibility
code, the whole premise collapses.

## The five validation gates

Run in order in `backend/src/patch/validate.ts`. Any failure returns the gate's error to the model
and retries, to a maximum of three attempts.

| # | Gate | Tool | Why |
|---|---|---|---|
| 1 | The diff applies cleanly | `git apply --check` | The model may have hallucinated context lines |
| 2 | The result parses | ts-morph | Catches broken JSX before anything expensive |
| 3 | It typechecks | `tsc --noEmit` scoped to the file | A patch that breaks the build is worse than no patch |
| 4 | No new accessibility errors | `eslint-plugin-jsx-a11y` | We must not introduce a violation while fixing one |
| 5 | Fifteen lines or fewer changed | diff stat | A large diff means it is rewriting, not fixing |

Gate 4 also runs on the **pre-patch** file, so we compare against a baseline rather than failing on
pre-existing errors elsewhere in the file.

If all three attempts fail, we emit `fix.failed` with the best attempt attached as a *suggested*
diff, clearly marked unverified. We never present an unvalidated diff as a fix.

## Worked example — the demo blocker

**Before**, `components/ProductCard.tsx:41`:

```tsx
<div className="card" data-ally-src="components/ProductCard.tsx:41:7">
  <img src={product.image} />
  <div className="add" onClick={() => addToCart(product.id)}>
    <PlusIcon />
  </div>
</div>
```

What the agent heard: `image. group. clickable.` — no name, no role, no way to know what it does.

What axe said: `image-alt` on the image. Nothing at all about the div, because axe does not flag a
click handler on a non-interactive element as a name violation.

**After**, a four-line diff:

```diff
--- a/components/ProductCard.tsx
+++ b/components/ProductCard.tsx
@@ -41,9 +41,12 @@
   <div className="card">
-    <img src={product.image} />
-    <div className="add" onClick={() => addToCart(product.id)}>
+    <img src={product.image} alt={product.name} />
+    <button
+      type="button"
+      className="add"
+      onClick={() => addToCart(product.id)}
+      aria-label={`Add ${product.name} to cart`}
+    >
       <PlusIcon />
-    </div>
+    </button>
   </div>
```

What the agent hears after the patch: `image, Blue linen shirt. button, Add Blue linen shirt to cart.`

Four lines. That is the diff that goes on screen, and its smallness is the point — a four-line change
was the difference between a usable store and an unusable one, and no rule checker in the room would
have told you which four lines.

## The second blocker: focus not trapped

The demo has two blockers, because one is a labelling bug that axe half-catches and one is a
behavioural bug that no rule checker can catch at all. The second is the dialog.

```diff
--- a/components/CartDialog.tsx
+++ b/components/CartDialog.tsx
@@ -12,7 +12,13 @@
-  <div className="overlay" hidden={!open}>
+  <div
+    className="overlay"
+    role="dialog"
+    aria-modal="true"
+    aria-labelledby="cart-title"
+    hidden={!open}
+    ref={focusTrapRef}
+  >
```

plus a small `useEffect` that moves focus into the dialog on open and restores it on close.

Say this out loud on stage: **axe cannot catch this one at any severity, because there is no rule
that says "focus must actually move".** It is the cleanest possible illustration of the gap.

## Opening the pull request

```
branch   ally/fix-<runId>
commit   "a11y: give product controls accessible names and trap focus in the cart dialog"
```

Pull request body template, in `backend/src/github/pr-template.ts`:

```md
## What a screen-reader user experienced

> Goal: complete checkout
> ...
> 04  "button. button. button. group. clickable."
> 05  Agent: I cannot tell which control adds an item. Trying each.
> 06  "dialog."  — focus remains behind the dialog
> 07  Goal abandoned at step 7 of 20.

**Blocker:** unlabelled controls, and focus not trapped in the cart dialog.
**WCAG:** 4.1.2 Name, Role, Value · 2.4.3 Focus Order

## What axe-core reported for the same page

14 rule violations. **None of them was the reason the goal could not be completed.**

## The change

<rationale>

## Verification

<filled in by the verify run — before 7 steps, blocked · after 11 steps, completed>

---
Opened by Ally. Reported by a user of this site via Barrier Report. <!-- when applicable -->
```

A human reviews and merges. Ally never auto-merges, and we say so.

## Known limits, stated plainly

- Server-rendered templating languages other than JSX (Blade, ERB, Twig, Razor) are unsupported by
  the source mapper. Mode B still works: the audit, the blocker and the suggested diff.
- Web components with a closed shadow root cannot be mapped, and often cannot be perceived either.
  See F-06.
- A blocker that is genuinely a CSS problem, such as a focus outline removed by `outline: none`,
  maps to a stylesheet, not a JSX line. Day 4 work if there is time; recorded as a limitation now.
- If the repo's HEAD has moved since the run, line numbers are stale. We pin the run's commit SHA
  and branch the pull request from it, and warn if the default branch has diverged. See F-31.
