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

What the agent hears: `image. group. clickable.`
What axe says: `image-alt` on the image. **Nothing about the div.** axe does not flag a click handler
on a non-interactive element as a name violation.

### 2 · Focus not trapped — `components/CartDialog.tsx`

The cart dialog is a plain `<div>` with no `role="dialog"`, no `aria-modal`, and no focus management.
It appears visually and is completely absent from a keyboard user's world.

What the agent hears: `dialog.` then nothing, because focus never moved into it.
What axe says: **nothing, at any severity.** There is no rule that says "focus must actually move".

That second one is the cleanest possible illustration of the gap, and it is the line to say out loud
on stage.

## Deliberate noise

To make the axe comparison honest and unrehearsed-looking, the page also carries about a dozen
real-but-irrelevant violations: low-contrast price notes, a few images with `alt="image_04.png"`,
a couple of unlabelled newsletter inputs, and content outside any landmark. These are what axe
reports. **None of them is the blocker.** That is the entire point of the fixture.

## Rules for this directory

- Do not fix the planted blockers here. `fixtures/fixed-shop` holds the after-state.
- Do not add a third blocker. Two is enough to tell the story and a third makes the demo long.
- Freeze this repo twelve hours before the demo and tag it `demo-frozen`. No commits after that,
  by anyone, for any reason. See F-51 in `docs/09-FAILURE-MODES.md`.
