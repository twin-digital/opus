---
'@thrashplay/fw-chronicler': minor
---

fix(farwatch): attach resource movements to their trial in the chronicle view.

The chronicle-legal view handed the model a flat, unattributed `ledger`, so it could not tell which trial produced each gain or loss — and guessed wrong (inverting a `sacrifice` trial's `vigor` cost into giving up the `item` it actually won, dropping a failed trial's loss, misattributing a prize to the wrong beat). Each trial now carries its own realized movements instead: `cost` (paid up front), `stake` (only when the trial failed), and `prize` (only when it won). The goal's `reward` is carried home exactly when the overall outcome is a success; the flat ledger is no longer passed, since every entry it held is now attributed to its trial, its optional goal, or the goal. The prompt template's schema legend documents the per-trial fields and that `sacrifice`'s given-up resource is the `cost`, never the `prize`.
