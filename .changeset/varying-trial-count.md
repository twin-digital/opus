---
'@thrashplay/fw-simulation': minor
---

feat(farwatch): adventures vary in length (weighted trial count).

The trial count was fixed at 4; it's now a per-adventure weighted draw from `trialCountWeights` in the new `config/adventure.yaml` (`AdventureConfig`), defaulting to 3–6 skewed toward 4–5. The chain's last trial still decides the overall outcome, so a longer adventure is a longer build. Tunable like the other generation tables.
