---
'@thrashplay/fw-chronicler': patch
'@thrashplay/farwatch': patch
---

chronicler: split the chronicle voice into two orthogonal snippet axes — `register` (the narrator's stance: legendary, saga, annalist, antiquarian, folktale, gritty) and `writing_style` (how ornate the prose is: mythic vs plain) — so they compose (e.g. an annalist's voice rendered plain or mythic). The `writing_style` snippets are reworded to be register-neutral ornament dials; the old default's "fantasy epic" flavor moves into the `legendary` register, and `CHRONICLE_DEFAULTS` (register: legendary, writing_style: mythic) preserves prior behavior. Adds `listPromptOptions()`, which discovers templates and snippet axes from the `prompts/` tree by convention.

farwatch inspector: replace the monolithic prompt-override textarea with a prompt-builder form — one dropdown per snippet axis, populated from `GET /options` so a new snippet file appears with no code change — and reorder the columns so the input (prompt builder) sits left of the output (chronicle), with the composed prompt shown read-only in the guts panel.
