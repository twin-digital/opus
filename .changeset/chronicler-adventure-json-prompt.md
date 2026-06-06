---
'@thrashplay/fw-chronicler': patch
---

chronicle prompt: restructure the chronicler template as a stable contract (role/channel, voice, fact-vs-invention rule, output shape, schema legend, one few-shot) over a single `{{adventure}}` placeholder, fed a JSON projection of the adventure with the resolver's dice (`roll`/`target`) projected out so numbers never reach the clean chronicle.

The template lives as an editable Markdown file in `chronicler/prompts/` (package root, a sibling of `src`/`dist`) and is loaded via `loadChronicleTemplate()` — the same relative path resolves in dev and the built output with no build-time asset copy, and it is read fresh on each call so prompt edits show up live in the inspector with no rebuild or restart.
