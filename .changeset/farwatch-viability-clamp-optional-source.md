---
'@thrashplay/fw-simulation': minor
'@thrashplay/fw-chronicler': minor
---

feat(farwatch): clamp inviable adventures to failure; surface optional aims to the chronicler.

An adventure whose goal was never there to win (`viable: false`) now resolves to `outcome: 'failure'` outright, however the trials went — the overall outcome can no longer contradict viability. Won optional goals enter the ledger under their own `optional` source (distinct from incidental `prize`s), and a trial bound to an optional goal no longer also rolls a random prize.

The chronicle-legal view now carries `optionalGoals` (each reward plus whether it was `won`), and the prompt template's schema legend documents them, the `optional` ledger source, and instructs weaving ledger gains/losses into the trial telling rather than listing them apart.
