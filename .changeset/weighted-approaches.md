---
'@thrashplay/fw-simulation': minor
---

feat(farwatch): weighted approach selection via a config table.

Replaces the party-driven approach stop-gap (which skewed every adventure toward the cast's social leanings) with a plain global weighted table: a trial's approach is drawn via `pickWeighted` from `approachWeights` in the new `config/approaches.yaml` (`ApproachesConfig`), skewed toward the adventure-common methods (combat, stealth, might, …) with the social and esoteric ones rarer. Tunable like the other generation tables. `pickPartyApproach` and the `offTypeChance` seeker knob are removed; `leadFor` still picks each trial's lead by affinity.
