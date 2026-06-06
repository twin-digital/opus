---
'@thrashplay/fw-simulation': minor
---

feat(farwatch): trial prizes (success boons) and upfront costs.

A won trial may yield a **prize** — a weighted resource (any kind, fungible or non-fungible), reflecting what was there to win — and a few approaches pay an **upfront cost** to attempt, win or lose (`wealth` lays down coin, `sacrifice` gives something up). Both are config-driven (`prizes.yaml`, `costs.yaml`, validated by zod) and folded into the adventure ledger alongside stakes and the goal reward.
