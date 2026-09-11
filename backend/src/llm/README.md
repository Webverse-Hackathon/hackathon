# llm/
The provider interface. EVERY model call in this codebase goes through here.
Files: provider.ts, anthropic.ts, cache.ts, cost.ts
No feature code imports an SDK directly. That is what makes the provider swappable and the spend
traceable.
