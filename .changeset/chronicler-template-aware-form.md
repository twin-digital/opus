---
'@thrashplay/fw-chronicler': patch
'@thrashplay/farwatch': patch
---

chronicler: `listPromptOptions()` now also reports `templateUses` — for each template, which snippet axes it actually contains (parsed from its placeholders) and whether it has an `{{examples}}` slot. Snippet pools stay shared across templates (no per-template duplication of `register`/`writing_style`); the per-template view is derived, not stored.

farwatch inspector: the prompt-builder form is now template-aware. Selecting a template shows only the snippet dropdowns that template uses, plus the example-count lever only when it has an examples slot — so `single-trial` no longer shows an irrelevant example count, and `summary` (were it pickable) would show only the voice axes. Snippet picks persist across template switches where the axis still applies. This also retires the "summary ignores invention" special-case at the UI layer: the form simply never offers an axis a template lacks.
