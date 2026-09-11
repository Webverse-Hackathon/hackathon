# frontend/ — the Ally dashboard

Next.js 15 App Router, React 19, Tailwind, Radix UI primitives.

## Routes

    /                    landing + the run form (url, goal, optional repo)
    /live/[runId]        SPLIT SCREEN — the site on the left, the narration stream on the right,
                         spoken aloud through the Web Speech API. This is the demo.
    /run/[runId]         the full report, server rendered so it is shareable as a link
    /barrier             barrier submission, typed or spoken
    /barrier/[id]        status page for a submitted barrier
    /runs                run history (day 4, nice to have)

## The two voices

The raw transcript lines are spoken VERBATIM in one voice. The agent's own narration is spoken in a
DIFFERENT voice. The contrast between the flat machine reading "image. image. image." and the agent
saying "I cannot tell which control adds an item" is the emotional beat of the whole demo.
Do not collapse them into one voice.

## Our own accessibility contract

We are shipping an accessibility product. If our own dashboard fails an Ally run, we lose the room.

  - every control reachable by keyboard, in a sensible order
  - every control has a real accessible name
  - run status changes announced through an aria-live region
  - focus trapped in any dialog, and returned on close
  - zero axe violations in CI
  - the verdict never conveyed by colour alone

Enforced by the dogfood suite (D-01 to D-07) in docs/10-TEST-CASES.md and by .github/workflows/dogfood.yml.
eslint-plugin-jsx-a11y runs as an ERROR, not a warning.
