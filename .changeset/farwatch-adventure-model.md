---
'@thrashplay/fw-simulation': minor
'@thrashplay/fw-chronicler': minor
'@thrashplay/farwatch': minor
---

feat(farwatch): model an adventure as an ordered, variable-length run of trials.

`resolveAdventure` returns an `Adventure` — `{ trials, outcome }`, where each `Trial` wraps a single `Check` (`roll`/`target`/`outcome`) — instead of a flat result. The trials resolve in order and the chain's last trial decides the overall outcome, so a longer adventure is a longer build. The trial count is a per-adventure weighted draw (`trialCountWeights` in `config/adventure.yaml`, defaulting to 3–6 skewed toward 4–5), tunable like the other generation tables. The chronicler reads the trial outcomes in order (told to join beats with "but"/"therefore", never "and then"), and the inspector renders the trial chain.
