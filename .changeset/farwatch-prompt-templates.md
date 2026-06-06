---
'@thrashplay/fw-chronicler': minor
---

feat(farwatch): move the chronicler prompt into an editable Markdown template, and hand the model a dice-free view.

The prompt now lives at `chronicler/prompts/chronicle.md` — a full chronicler brief (voice, the but/therefore grammar, a truth-vs-invention contract, a record schema, and a worked example) editable without touching TypeScript. `buildPrompt` fills a single `{{adventure}}` placeholder with a **chronicle-legal view** of the adventure — the graph shape projected down to just the outcomes, with the resolver's `roll`/`target` dropped, so the dice are exposed in the inspector's guts but never reach the model (*expose the dice, hide the genome*).

The template sits at the package root (sibling to `src/`/`dist/`) so the same relative path resolves in dev and the built output — no build-time asset copy. It is re-read per call, so prompt edits show up live in the inspector with no rebuild or restart.
