---
'@thrashplay/fw-simulation': minor
'@thrashplay/fw-chronicler': minor
'@thrashplay/farwatch': minor
---

feat(farwatch): model an adventure as an ordered run of trials (the chronicler seam).

`resolveAdventure` now returns an `Adventure` — `{ trials, outcome }`, where each `Trial` wraps a single `Check` (`roll`/`target`/`outcome`) — instead of a flat `AdventureResult`. An adventure runs a short fixed chain of trials (`3 + 1`: a few of approach, then a deciding one) resolved in order, and its overall outcome is its final trial's. The chronicler reads the trial outcomes in order and is told to join the beats with "but"/"therefore" (never "and then"), and the inspector renders the trial chain.
