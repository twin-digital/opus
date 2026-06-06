---
'@thrashplay/fw-chronicler': minor
---

feat(farwatch): the chronicler sees the adventure's goal and ledger.

The chronicle-legal view now includes the **goal** (its reward and viability) and the resource **ledger** (what was won and lost), alongside each trial's approach and outcome — still dice-free. The prompt template's schema legend documents the new fields and the resource kinds, and instructs rendering gains and losses as events in the world rather than bare kinds or tiers. (Pre-generated few-shot examples predate these fields and should be regenerated via `gen-examples`.)
