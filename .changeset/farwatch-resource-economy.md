---
'@thrashplay/fw-simulation': minor
---

feat(farwatch): a plain-resource economy for adventures.

Adventures now carry a **goal** (a weighted reward — a fungible tier or a non-fungible `item`/`secret` — with a viability flag), trials carry an approach-linked **stake** (lost on failure), and the adventure assembles an itemized **ledger** (stakes lost + reward won). Generation weights live in editable **YAML under `config/`**, validated by **zod** schemas (with `.meta()` descriptions) that key tables against the real resource/approach vocabulary. Adds a `RESOURCE_INFO` catalog (single source for resource-kind meaning), a combined `RESOURCE_KINDS`, a `pickWeighted` map picker, and a `@thrashplay/fw-simulation/testing` factory (`makeAdventure`/`makeTrial`) so fixtures don't break as the model grows. Approaches moved to their own module.
