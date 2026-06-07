---
'@thrashplay/farwatch': patch
---

feat(farwatch): a dev-only web inspector (`pnpm --filter @thrashplay/farwatch serve`) that runs the seed → resolve → chronicle pipeline and shows the chronicle prose beside the fully-exposed guts (the pinned adventure, the exact prompt, and the raw completion) — a debug superset of the eventual player view that hides nothing.

The render paths make several LLM calls, so failures are made legible: the server logs `/run` start, completion (with elapsed), and failures (full stack) to its terminal, and installs `unhandledRejection`/`uncaughtException` handlers that log and keep serving rather than dying silently. The 500 response carries the stack, and the page shows it in the guts plus a clear hint — on a no-response failure — to check the server terminal, instead of a bare "Failed to fetch".
