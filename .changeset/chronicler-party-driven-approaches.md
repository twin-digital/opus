---
'@thrashplay/fw-simulation': minor
---

feat(farwatch): party-driven approach selection (stop-gap for chronicler iteration).

A trial's approach was rolled uniformly at random, blind to the party — so it rarely matched anyone's sparse skills and every lead came back "indifferent". `pickPartyApproach` now weights the draw by the party's **positive affinities** (so what they do reflects who went, and `leadFor` picks someone genuinely keen), with an `offTypeChance` (`seekers.yaml`, default 0.2) that instead lands on an approach no one is drawn to. **This is explicitly a stop-gap for tuning the chronicler, not the intended sim model** — the real sim derives a trial's approach from its obstacle and the agents' choices (deferred); this just makes the cast shape the events while we iterate on the prose.
