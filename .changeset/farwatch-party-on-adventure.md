---
'@thrashplay/fw-simulation': minor
---

feat(farwatch): a party of seekers on the adventure, with an affinity-chosen lead per trial.

`resolveAdventure` now pulls a party (`pickParty(rng, roster())`) and records it on the `Adventure` as `party`. Each `Trial` gains a `lead` — the `id` of the party member who led it, chosen by `leadFor`: highest affinity for the trial's approach, competence breaking an affinity tie (the able get pressed in), and a random pick among any remaining ties so the spotlight spreads across the party instead of always landing on the first member (the common case, since sparse skills mean most trials have no one notably keen). The lead never touches the outcome — the check still decides — it colors *who* and *how*. `roster()` is now memoized on the seeker-config identity so the resolver's hot path doesn't re-roll the cast every adventure (still live on `seekers.yaml` edits). Not yet surfaced to the chronicler or inspector.
