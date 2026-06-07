---
'@thrashplay/fw-chronicler': patch
'@thrashplay/farwatch': patch
---

chronicler: add a "zoom in, then summarise" narration pipeline that yields markedly richer detail than one-shot whole-adventure narration.

- `single-trial` template + `buildSingleTrialPrompt(adventure, trialIndex, adventureSoFar, overrides?)` narrate one trial at a time, given the expedition's aim (goal + optional goals), the prose of the story so far, and just that trial's mechanics (approach, outcome, cost/stake/prize/discovery) — projected through the same chronicle-legal view (no dice).
- `chronicleByTrial(...)` chains the beats, feeding each narrative back as the story so far for the next.
- `summary` template + `buildSummaryPrompt(adventure, fullNarrative, overrides?)` distil the beat draft into one finished chronicle, inventing nothing; the summary takes only the voice axes (`register`/`writing_style`), since `invention` would fight distillation.
- `chronicleZoomed(...)` runs the whole pipeline (chain → summarise) and returns both the beats and the finished summary.

These reuse the existing snippet axes and are zero-shot (the few-shot store is whole-adventure).

farwatch inspector: selecting the `single-trial` template (the template dropdown now appears, since there are multiple) runs the full pipeline — the finished summary is shown as the chronicle, with every beat's prompt/draft and the summary step in the guts. `summary` is a pipeline step and is not offered as a standalone template. No page changes needed.
