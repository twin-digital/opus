---
'@thrashplay/fw-simulation': minor
'@thrashplay/fw-chronicler': minor
---

feat(farwatch): each trial has an `approach` — the method used to (try to) overcome it.

`Trial` gains an `approach` drawn from a 22-method pool (`APPROACHES`: combat, stealth, deception, endurance, magic, …) — a mechanical skeleton with no narrative texture. The draw is a plain global weighted table (`approachWeights` in `config/approaches.yaml`, `ApproachesConfig`), skewed toward the adventure-common methods (combat, stealth, might, …) with the social and esoteric ones rarer, tunable like the other generation tables. The approach joins the chronicle-legal view alongside the outcome, and the prompt's schema and examples tell the chronicler to render each as a deed (a `combat` trial met with force, a failed `deception` a ruse seen through) — never as a bare label — so adventures stop collapsing into generic "cross water / climb mountain / open door" beats.
