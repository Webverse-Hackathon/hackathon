# fixed-shop — the verify site

A working copy of `fixtures/broken-shop`, served by its own dev server on **port 3101**. The fix flow
(`backend/src/fix/`) syncs this directory from `broken-shop`, writes the validated patch into it, runs
`tsc` here as the typecheck gate, and then re-runs the same goal against `http://localhost:3101`.

Committed in its broken state, identical to `broken-shop`. After a demo, `git checkout fixtures/fixed-shop`
puts it back; the next fix also re-syncs it before patching, so a leftover patch cannot leak into a run.

    pnpm --filter @ally/fixture-fixed-shop dev      # http://localhost:3101

Do not edit the source here by hand. Edit `broken-shop`, and the next fix copies it across.
