---
'@thrashplay/fw-simulation': minor
---

feat(farwatch): optional (secondary) goals bound to trials.

An adventure rolls 0–n **optional goals** (a weighted count from `goals.yaml`), each bound to a distinct trial: that trial's prize becomes the optional reward, superseding the random prize, so the optional is won by winning its trial. Rewards come from the goal table, skewed smaller than the primary. The aims are recorded on the adventure (`optionalGoals`); won ones enter the ledger as prizes.
