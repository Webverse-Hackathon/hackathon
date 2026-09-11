# 11 · Demo Script

Five minutes. The demo is the product, so rehearse it as many times as you rehearse the code.

**Rule: the audio starts within the first ninety seconds.** Everything before it is setup, and setup
is the only part a judge can lose interest during.

## Roles

| Role | Who | Does |
|---|---|---|
| Driver | one person | laptop, clicks, never speaks while audio plays |
| Narrator | one person | speaks the framing, watches the room, handles questions |
| Spotter | one person | watches the run, ready to switch to replay mode, handles the fallback |

The narrator never touches the laptop. The driver never talks over the narration. This matters more
than it sounds.

## The five minutes

### 0:00 – 0:30 · The number

> "Ninety-six percent of the top million websites fail basic accessibility checks. That number went
> *up* this year, for the first time in six years. The average page has fifty-six errors. One point
> three billion people are locked out of software, and it is getting worse, not better."

One slide. Three numbers. No product yet.

### 0:30 – 1:00 · The gap

> "Tools exist. axe, Lighthouse, WAVE. Every one of them is a rule checker: it reads the page at
> rest and reports broken rules. They catch about a third of real problems, and they are blind to
> the ones that actually strand a person. Alt text that says `image_04.png` passes. A focus order
> that jumps header to footer passes. A checkout that is perfectly labelled and impossible to finish
> without a mouse passes.
>
> Every existing tool answers: *does this page break a rule?*
> We built something that answers a different question: **can a blind person buy the ticket?**"

### 1:00 – 1:20 · What Ally is

> "You give Ally a URL and a goal in plain English. It opens the page in a real browser — and then
> we take the screenshot away. It gets only the accessibility tree, the same text a screen reader
> speaks, and it may only send keystrokes. No coordinates. No vision. That constraint is the whole
> simulation. Then it tries to reach the goal, and it tells you the exact step where it gave up."

Driver opens `/`, types the URL and the goal, and submits. **Do not narrate the form.**

### 1:20 – 2:40 · The beat

Split screen. Left: the store, clean and modern. Right: the narration column, empty.

> "On the left is the site, the way you see it. It looks fine. On the right is everything the agent
> is allowed to perceive."

**Then stop talking and let the audio run.**

```
01  "banner. navigation. list, six items."
02  "main. heading level one, Summer Sale."
03  "image. image. image."
04  "button. button. button. group. clickable."
05  Agent: I cannot tell which control adds an item. Trying each.
06  "dialog."                          — focus remains behind the dialog
07  Goal abandoned at step 7 of 20.
    Blocker: unlabelled controls + focus not trapped.
```

Step 3 is where the room changes. `image. image. image.` against a screen full of product
photography. Say nothing. Let it land.

After the terminal card:

> "Step seven of twenty. It could not find a way to add anything to the cart, and when a dialog
> opened, focus never went into it."

### 2:40 – 3:10 · The kill shot

The verdict banner appears.

> "We also ran axe-core on the same page — the industry standard, the thing your CI probably runs
> today. It reported fourteen violations."

Pause.

> "Zero of them was the reason the agent could not check out. Not one. The thing that actually
> stopped a human being was invisible to every rule checker in this room."

Show the two-column comparison. Point at the focus-trap row and say the sentence that seals it:

> "There is no rule that says *focus must actually move*. So there is no tool that can catch this.
> That gap is the entire product."

### 3:10 – 4:10 · The fix

Driver clicks **Fix this**. Five stages tick green.

> "It maps the blocking node back through the DOM to the exact line of JSX that produced it —
> `ProductCard.tsx`, line forty-one. It writes the smallest change that fixes it, runs it through
> the typechecker and an accessibility linter, and opens a pull request."

The pull request appears on screen. A four-line diff.

> "Four lines. That was the difference between a store you can use and a store you cannot."

### 4:10 – 4:40 · The proof

The verify run starts automatically.

> "And then it runs the same goal again, against the patched build."

```
"image, Blue linen shirt. button, Add Blue linen shirt to cart."
...
Goal completed in 11 steps.
```

> "Eleven steps. Same agent, same constraint, same goal. That is not a claim, it is a re-run."

### 4:40 – 5:00 · The close

> "This runs in CI on every pull request, so it is a check, not a consultancy. And there is a second
> loop we care about more. A blind user who hits a wall on any site describes it in their own words —
> *'I can't submit the form on the pension page'* — and Ally turns that sentence into a reproducible
> run, confirms the blocker, and files it with the patch attached.
>
> The disabled person stops being a bug report nobody can reproduce, and becomes the source of
> truth.
>
> The European Accessibility Act and ADA Title II obligations both landed this year. This is a
> deadline, not a nice-to-have. Thank you."

Stop. Do not add anything after "thank you".

---

## The seven lines that carry the demo

Pre-render these as audio and keep them on the laptop as a backstop (F-52).

```
1  banner. navigation. list, six items.
2  main. heading level one, Summer Sale.
3  image. image. image.
4  button. button. button. group. clickable.
5  I cannot tell which control adds an item. Trying each.
6  dialog.
7  Goal abandoned at step 7 of 20.
```

Two voices, always. The flat transcript voice reading the page, and the agent's own voice for line
5. The contrast between them is the demo. One voice for both kills it.

---

## Preflight, 30 minutes before

```
[ ] Run the full pre-demo checklist in 10-TEST-CASES.md section 8
[ ] One complete throwaway run to warm the browser pool (F-53)
[ ] Audio tested through the venue output, at volume, from this laptop (F-52)
[ ] Laptop display mirrored and resolution set; the split screen is legible from the back row
[ ] Notifications off. Do Not Disturb on. Slack and email quit.
[ ] Browser zoom set so the narration column is readable from ten metres
[ ] The demo tab and the replay tab both open and warm
[ ] Phone hotspot on and tested as the wifi fallback
[ ] The pull request from the last rehearsal is CLOSED, so the new one is obviously new
```

That last one is easy to forget and embarrassing to explain.

## Fallbacks, in order

| If | Then |
|---|---|
| The run is slow but working | Keep talking over it. Never apologise for a five-second wait. |
| The wifi dies | Spotter switches to the replay tab. `ALLY_REPLAY=<runId>`. Identical UI. Say nothing about it. |
| The replay also fails | Play the recorded video. Narrate over it live. Still works. |
| The fix flow fails | Show the pull request from the rehearsal run, and say plainly that the generation is live but you are showing an earlier one for time. Honesty costs nothing here. |
| The agent succeeds when it should fail | You are on the wrong fixture. Spotter checks the URL. This is why the digest is pinned (F-51). |

## Anticipated questions, with answers

**"Is this just axe with an LLM on top?"**
No. We run axe as a baseline specifically so we can show it missing the blocker. Our finding comes
from task completion, not from rules. The focus-trap failure has no axe rule at any severity.

**"How do you know the agent is not cheating and looking at the page?"**
The driver exports five functions and none of them return pixels. There is a blocking test suite
that asserts no prompt we send contains an image or a coordinate. We can show you the test.

**"Is it really a screen reader?"**
It reads the accessibility tree, which is exactly the data source NVDA and JAWS read. We do not
bundle a screen reader binary, because you cannot legally or reliably containerise one. Serialising
the tree ourselves is both more honest and more portable.

**"What if the LLM is just wrong?"**
Often it will be, so nothing it says is trusted on its own. Success claims are verified against
transcript evidence. Blocker categories are cross-checked by a deterministic classifier. Patches go
through five gates and a re-run. Anything unverified is labelled unverified rather than hidden.

**"Can it fix any website?"**
No, and we should be precise. Ally *audits* any URL. It *patches* repositories that connect to it,
because a patch needs source. That is the same boundary every code tool has.

**"Run it on my site."**
Yes. Say yes. Frame it first: this is live, we have never seen it, and it may get stuck for a boring
reason as well as an interesting one — both are informative (F-54).

**"What is the business model?"**
A per-repository CI check. The European Accessibility Act and ADA Title II obligations landed in
2025 and 2026, so the buyer already has a budget line and a deadline.
