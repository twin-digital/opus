---
'@thrashplay/fw-simulation': minor
---

feat(farwatch): pre-seeded seeker appearance + temperament (permanent-record texture).

Each seeker now carries stable descriptive texture — `appearance` (a physical sketch) and `temperament` — so they read the same across every chronicle rather than being re-imagined per adventure. It is **not** simulation load-bearing (the resolver never reads it); it's the kind of fact the world's permanent record would hold, hand-seeded for now in `profiles.ts` as a stand-in for a future "texturizer" process. The profile table is keyed by name and *is* the cast vocabulary (the name pool is now its keys), so every drawable seeker is fully textured; the fields are optional on `Seeker`, so a seeker built without the record simply has none and the chronicler falls back to inventing them.
