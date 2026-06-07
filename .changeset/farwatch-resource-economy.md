---
'@thrashplay/fw-simulation': minor
'@thrashplay/fw-chronicler': minor
'@thrashplay/farwatch': minor
---

feat(farwatch): the adventure goal & resource economy.

An adventure carries a **goal** — a weighted reward (a fungible tier, or a non-fungible `item`/`secret`) with a viability flag; an adventure whose goal was never there to win (`viable: false`) clamps to `outcome: 'failure'` regardless of how the trials went. Around it, each trial realizes its own resource movements: a few approaches pay an upfront **cost** (win or lose — `wealth` lays down coin, `sacrifice` gives something up), a failed trial forfeits its **stake**, and a won trial may yield a **prize** (any resource kind). Two kinds of secondary goal layer on top: **optional goals** bound to distinct trials (a weighted 0–n count; that trial's prize becomes the optional reward, won by winning the trial), and **unknown goals** a winning trial discovers by chance (`unknownSpawnChance`, drawn with their own tier weights that can skew large). The goal's reward is carried home exactly on overall success.

Every movement is attributed — to its trial (`cost`/`stake`/`prize`), its optional goal, the discovered goal, or the goal reward — and assembled into an itemized **ledger**. Generation weights live in editable **YAML under `config/`**, validated by **zod** schemas keyed against the real resource/approach vocabulary. Adds a `RESOURCE_INFO` catalog, a `pickWeighted` map picker, and a `@thrashplay/fw-simulation/testing` factory (`makeAdventure`/`makeTrial`) so fixtures don't break as the model grows. The dev inspector's guts panel gains readable **Goals** (primary + viability, optionals won/missed, discoveries) and **Ledger** (itemized gains/losses) sections.
