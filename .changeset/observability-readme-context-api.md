---
'@twin-digital/observability-lib': patch
---

Fix README examples to match the actual API: logger/metrics/tracer are injected onto the handler's `context` (second parameter), not a third `{ internal }` argument.
