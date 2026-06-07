---
'@thrashplay/fw-simulation': minor
---

feat(farwatch): seekers, a standing roster, and a party per adventure.

A **seeker** is a member of the compact with a stable identity (`id` + `name`, so chronicles can come to know them) and a **sparse** skill profile over the approach vocabulary, where each rated approach carries two independent signed levels in `[-2, +2]`: **affinity** (how drawn they are to leading with it) and **competence** (how effective they are when they do). Seekers also carry pre-seeded descriptive texture — `appearance` and `temperament` — so they read the same across every chronicle; it is not simulation load-bearing (the resolver never reads it), the kind of fact the world's permanent record would hold, hand-seeded in `profiles.ts` as a stand-in for a future texturizer.

`generateRoster(rng, size)` builds distinct seekers from a name pool (sampled without replacement) with weighted skill profiles; `roster()` is the standing cast of `ROSTER_SIZE` grown from a fixed seed, so the same people recur across chronicles, regenerated per call so tuning `seekers.yaml` re-rolls the cast live. `resolveAdventure` pulls a weighted-size (3–5) party (`pickParty`) and records it on the `Adventure`; each `Trial` gains a `lead` — the party member who led it, chosen by `leadFor` (highest affinity for the trial's approach, competence breaking ties, random among remaining ties so the spotlight spreads). The lead never touches the outcome — the check still decides — it colors _who_ and _how_. Generation knobs live in `config/seekers.yaml` (`SeekersConfig` zod schema).
