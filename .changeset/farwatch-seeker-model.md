---
'@thrashplay/fw-simulation': minor
---

feat(farwatch): seeker data model — the "who" of a party.

A **seeker** is a member of the covenant with a stable identity (`id` + `name`, so chronicles can come to know them) and a **sparse** profile of skills over the approach vocabulary. Each rated approach carries two independent scales — **affinity** (how drawn they are to leading with it) and **competence** (how effective they are when they do) — as signed levels in `[-2, +2]` where `0` is unremarkable. Unrated approaches default to `0`/`0` (`skillFor`). Word scales (`AFFINITY_WORDS`, `COMPETENCE_WORDS`) name the levels for a later chronicler projection. Not yet wired into the adventure or generated — this is the model only.
