# preview/
Server-side screenshots for the LEFT panel of the split screen, used when the target site refuses to
be embedded in an iframe (F-07).
This module must NEVER be importable from agent/. Enforced by an eslint no-restricted-imports rule
and asserted by purity test P-4. The whole premise depends on that separation.
