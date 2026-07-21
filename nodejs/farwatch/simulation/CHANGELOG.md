# @thrashplay/fw-simulation

## 0.1.1

### Patch Changes

- da1e483: Regenerate the managed eslint and vite config files to call the shared config packages' compose helpers (`defineProjectConfig` / `defineAppConfig`) instead of inlining the composition. No behavior change.
- Updated dependencies [da1e483]
  - @thrashplay/fw-core@0.0.2

## 0.1.0

### Minor Changes

- a238fe3: feat(farwatch): model an adventure as an ordered, variable-length run of trials.

  `resolveAdventure` returns an `Adventure` — `{ trials, outcome }`, where each `Trial` wraps a single `Check` (`roll`/`target`/`outcome`) — instead of a flat result. The trials resolve in order and the chain's last trial decides the overall outcome, so a longer adventure is a longer build. The trial count is a per-adventure weighted draw (`trialCountWeights` in `config/adventure.yaml`, defaulting to 3–6 skewed toward 4–5), tunable like the other generation tables. The chronicler reads the trial outcomes in order (told to join beats with "but"/"therefore", never "and then"), and the inspector renders the trial chain.

- a238fe3: feat(farwatch): the adventure goal & resource economy.

  An adventure carries a **goal** — a weighted reward (a fungible tier, or a non-fungible `item`/`secret`) with a viability flag; an adventure whose goal was never there to win (`viable: false`) clamps to `outcome: 'failure'` regardless of how the trials went. Around it, each trial realizes its own resource movements: a few approaches pay an upfront **cost** (win or lose — `wealth` lays down coin, `sacrifice` gives something up), a failed trial forfeits its **stake**, and a won trial may yield a **prize** (any resource kind). Two kinds of secondary goal layer on top: **optional goals** bound to distinct trials (a weighted 0–n count; that trial's prize becomes the optional reward, won by winning the trial), and **unknown goals** a winning trial discovers by chance (`unknownSpawnChance`, drawn with their own tier weights that can skew large). The goal's reward is carried home exactly on overall success.

  Every movement is attributed — to its trial (`cost`/`stake`/`prize`), its optional goal, the discovered goal, or the goal reward — and assembled into an itemized **ledger**. Generation weights live in editable **YAML under `config/`**, validated by **zod** schemas keyed against the real resource/approach vocabulary. Adds a `RESOURCE_INFO` catalog, a `pickWeighted` map picker, and a `@thrashplay/fw-simulation/testing` factory (`makeAdventure`/`makeTrial`) so fixtures don't break as the model grows. The dev inspector's guts panel gains readable **Goals** (primary + viability, optionals won/missed, discoveries) and **Ledger** (itemized gains/losses) sections.

- a238fe3: feat(farwatch): seekers, a standing roster, and a party per adventure.

  A **seeker** is a member of the compact with a stable identity (`id` + `name`, so chronicles can come to know them) and a **sparse** skill profile over the approach vocabulary, where each rated approach carries two independent signed levels in `[-2, +2]`: **affinity** (how drawn they are to leading with it) and **competence** (how effective they are when they do). Seekers also carry pre-seeded descriptive texture — `appearance` and `temperament` — so they read the same across every chronicle; it is not simulation load-bearing (the resolver never reads it), the kind of fact the world's permanent record would hold, hand-seeded in `profiles.ts` as a stand-in for a future texturizer.

  `generateRoster(rng, size)` builds distinct seekers from a name pool (sampled without replacement) with weighted skill profiles; `roster()` is the standing cast of `ROSTER_SIZE` grown from a fixed seed, so the same people recur across chronicles, regenerated per call so tuning `seekers.yaml` re-rolls the cast live. `resolveAdventure` pulls a weighted-size (3–5) party (`pickParty`) and records it on the `Adventure`; each `Trial` gains a `lead` — the party member who led it, chosen by `leadFor` (highest affinity for the trial's approach, competence breaking ties, random among remaining ties so the spotlight spreads). The lead never touches the outcome — the check still decides — it colors _who_ and _how_. Generation knobs live in `config/seekers.yaml` (`SeekersConfig` zod schema).

- a238fe3: feat(farwatch): each trial has an `approach` — the method used to (try to) overcome it.

  `Trial` gains an `approach` drawn from a 22-method pool (`APPROACHES`: combat, stealth, deception, endurance, magic, …) — a mechanical skeleton with no narrative texture. The draw is a plain global weighted table (`approachWeights` in `config/approaches.yaml`, `ApproachesConfig`), skewed toward the adventure-common methods (combat, stealth, might, …) with the social and esoteric ones rarer, tunable like the other generation tables. The approach joins the chronicle-legal view alongside the outcome, and the prompt's schema and examples tell the chronicler to render each as a deed (a `combat` trial met with force, a failed `deception` a ruse seen through) — never as a bare label — so adventures stop collapsing into generic "cross water / climb mountain / open door" beats.

### Patch Changes

- @thrashplay/fw-core@0.0.1

## 0.0.1

### Patch Changes

- 914e40a: initial creation of farwatch project
- Updated dependencies [914e40a]
  - @thrashplay/fw-core@0.0.1
