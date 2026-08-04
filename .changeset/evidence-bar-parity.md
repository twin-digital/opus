---
'@twin-digital/design-process': patch
---

Close two facts/evidence validation gaps: a malformed `facts/` or `evidence/` pool file now raises a `pool-parse` finding instead of being silently dropped, and every run's recorded `output` must exist in the tree (`run-output-exists`), not only runs a fact cites.
