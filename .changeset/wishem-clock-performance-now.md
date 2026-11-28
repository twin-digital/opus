---
'@thrashplay/wishem-clock': patch
---

The clock uses `performance.now()`, not `Date.now`, as its default source of real time.
