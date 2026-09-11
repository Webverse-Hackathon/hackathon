# agent/
The perceive - narrate - decide - act loop. Read docs/06-AGENT-LOOP.md first.
Files: loop.ts, prompts.ts, tools.ts, narrate.ts, confirm.ts, loop-detect.ts, classify.ts
Rules: no `any` here. Must NOT import driver internals, preview/ or sourcemap/ (purity test P-4).
