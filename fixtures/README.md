# fixtures/
Deliberately broken sites with known expected outcomes. These are the tests that decide whether the
product works. Full table in docs/10-TEST-CASES.md section 3.

broken-shop is the demo target. Build it with ALLY_SOURCE=1 so every JSX element carries
data-ally-src, which is what makes the source mapping deterministic on stage.

The two most important fixtures are alt-text-lies and focus-jump: pages axe scores as clean that a
human cannot use. If a judge asks for proof of the premise, those are it.
