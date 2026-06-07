---
'@thrashplay/fw-chronicler': minor
---

feat(farwatch): the chronicler's dice-free view carries goals and per-trial resource movements.

The chronicle-legal view (`chronicleView`) projects the adventure for the model with the resolver's dice (`roll`/`target`) stripped, and now includes the **goal** (reward + viability), the **optional goals** (each reward + whether it was won), and each trial's realized **movements** — `cost` (paid up front), `stake` (only on failure), and `prize` (only on a win) — attributed to the trial that produced them rather than as a flat, unattributed ledger the model would misread (inverting a `sacrifice`'s cost into the item it won, dropping a failed trial's loss, misattributing a prize). The goal's `reward` is carried home exactly on overall success. The prompt template's schema legend documents the goal/optional/per-trial fields and the resource kinds, notes that a `sacrifice`'s given-up resource is its `cost` (never the `prize`), and instructs weaving gains and losses into the trial telling as events in the world rather than listing them apart. (Pre-generated few-shot examples predate these fields and should be regenerated via `gen-examples`.)
