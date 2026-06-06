---
'@thrashplay/fw-simulation': minor
'@thrashplay/farwatch': minor
---

feat(farwatch): unknown (unsought) goals discovered by winning trials, shown in the inspector.

A **won** trial now has a low per-trial chance (`unknownSpawnChance` in `goals.yaml`) to mint an **unknown goal** — a reward nobody set out for, so the find has a cause. Its reward is drawn from the goal table with its own `unknownTierWeights` (which can skew large, occasionally worth more than the primary). Unknown goals are recorded on the adventure (`unknownGoals`, each bound to the trial that found it) and enter the ledger under a new `unknown` source.

The dev inspector's "guts" panel gains readable **Goals** (primary + viability, optionals won/missed, discoveries) and **Ledger** (itemized gains/losses) sections alongside the raw JSON.
