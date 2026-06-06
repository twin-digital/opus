---
'@thrashplay/fw-chronicler': patch
'@thrashplay/farwatch': patch
---

chronicler: make prompts composable instead of monolithic, so prompt sections can be A/B/C-tested in combination. `buildPrompt(spec)` now takes a named template (`prompts/templates/<name>.md`) plus two fill channels — **snippets** (a placeholder `{{writing_style}}` is filled from `prompts/writing-style/<name>.md`, the directory being the placeholder name by convention) and **data** (runtime strings like the serialized adventure, which have no file). It validates that the channels exactly cover the template's placeholders, failing loudly on an unfilled placeholder, a stray fill (typo), a both-channels collision, or a missing snippet file.

`buildChroniclePrompt(adventure, overrides?)` is the chronicle-specific convenience over `buildPrompt`: it applies the default snippet selection and supplies the adventure data, and `overrides` swaps a single snippet or the template for comparison. The three monolithic prompt files are decomposed into one template plus `writing-style/` (mythic, plain), `invention/` (tight, free, descriptive), and `examples/` (single, varied) snippet pools; `loadChronicleTemplate` is removed.
