---
'@thrashplay/fw-simulation': minor
---

feat(farwatch): generate a fixed seeker roster and pull a party per adventure.

A `generateRoster(rng, size)` builds distinct seekers from a 25-name pool (sampled without replacement), each with a sparse, weighted skill profile over the approaches — a listed skill always deviates on at least one axis (a `0`/`0` is re-drawn). `roster()` is the standing cast of `ROSTER_SIZE` (10) grown from a fixed seed, so the same people recur across chronicles; it regenerates per call so tuning `seekers.yaml` re-rolls the cast live. `pickParty(rng, roster)` pulls a weighted-size (3–5) distinct subset for one adventure. Generation knobs (`skillCountWeights`, `ratingWeights`, `partySizeWeights`) live in the new `config/seekers.yaml` with a `SeekersConfig` zod schema. The shared `pickDistinct` helper moved from `goals.ts` to `random.ts`. Not yet attached to the adventure or chronicle.
