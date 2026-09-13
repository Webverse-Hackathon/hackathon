# broken-shop — the demo target

A small storefront that looks clean and modern to a sighted person and is unusable with a screen
reader. Built with Next.js so the JSX source mapping works, and with `ALLY_SOURCE=1` so every
element carries `data-ally-src`.

**Goal used in the demo:** `complete checkout`
**Expected outcome:** `BLOCKED` at step 5–9, category `UNLABELLED_CONTROL`,
`blockerCaughtByAxe: false`

## The two planted blockers

### 1 · Unlabelled controls — `components/ProductCard.tsx`

The add-to-cart control is a `<div onClick>` containing only an icon. No accessible name, no role,
no keyboard reachability.

```tsx
<div className="card">
  <img src={product.image} />
  <div className="add" onClick={() => addToCart(product.id)}>
    <PlusIcon />
  </div>
</div>
```

What the agent hears, recorded from real Chromium, for every product:
`image. image. Blue linen shirt. $48.00.` The first `image.` is the product photo with no alt text;
the second is the plus icon inside the `<div onClick>`. There is no button and no "clickable" state:
nothing in the tree says anything can be added to the cart. (An earlier draft of this README guessed
`image. group. clickable.`; see F-68.)
What axe says: `image-alt` on the image. **Nothing about the div.** axe does not flag a click handler
on a non-interactive element as a name violation.

### 2 · Focus not trapped — `components/CartDialog.tsx`

The cart dialog is a plain `<div>` with no `role="dialog"`, no `aria-modal`, and no focus management.
It appears visually and is completely absent from a keyboard user's world.

What the agent hears, recorded: after Enter on `button, Cart (0).` the transcript is
`nothing new was announced.`, and the next Tab lands on the newsletter's unlabelled `edit.` instead of
anything in the cart. There is no `dialog.` line, because without `role="dialog"` the tree has no dialog.
What axe says: **nothing, at any severity.** There is no rule that says "focus must actually move".

That second one is the cleanest possible illustration of the gap, and it is the line to say out loud
on stage.

## Deliberate noise

To make the axe comparison honest and unrehearsed-looking, the page also carries about a dozen
real-but-irrelevant violations: low-contrast price notes, a few images with `alt="image_04.png"`,
a couple of unlabelled newsletter inputs, and content outside any landmark. These are what axe
reports. **None of them is the blocker.** That is the entire point of the fixture.

## Running it

    pnpm --filter @ally/fixture-broken-shop build
    pnpm --filter @ally/fixture-broken-shop start      # http://localhost:3100

Use the production build for agent runs. `next dev` works, but compiles on first request.

The add-to-cart card starts at `components/ProductCard.tsx:41:7` and the cart overlay at
`components/CartDialog.tsx:12`, matching `docs/07-SOURCE-MAPPING-AND-PATCH.md`. The `ALLY_SOURCE=1`
source plugin that stamps `data-ally-src` is Day 3 work; until then the flag has no effect.

## Rules for this directory

- Do not fix the planted blockers here. `fixtures/fixed-shop` holds the after-state.
- Do not add a third blocker. Two is enough to tell the story and a third makes the demo long.
- Freeze this repo twelve hours before the demo and tag it `demo-frozen`. No commits after that,
  by anyone, for any reason. See F-51 in `docs/09-FAILURE-MODES.md`.
