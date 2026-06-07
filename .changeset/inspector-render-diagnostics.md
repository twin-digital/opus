---
'@thrashplay/farwatch': patch
---

fix(farwatch): diagnostics when an inspector render fails.

A failed render showed only "Failed to fetch" with no trace, because an error escaping a request's promise chain (the single-trial / pipeline paths make several LLM calls) could crash the process before any 500 was sent, and nothing was logged. The inspector server now logs `/run` start, completion (with elapsed), and failures (full stack) to its terminal, and installs `unhandledRejection`/`uncaughtException` handlers that log and keep serving rather than dying silently. The 500 response carries the stack, and the page shows it in the guts plus a clear hint — on a no-response failure — to check the server terminal.
