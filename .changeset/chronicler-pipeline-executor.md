---
'@thrashplay/fw-chronicler': minor
---

chronicler: add a pipeline executor — the first slice of authored, multi-step narration. A pipeline (`pipelines/<name>.yaml`) is a list of steps that pass named JSON values through a lexically-scoped context: `derive` (pure transforms — `pick`/`flatten`), `call` (fill a template from path bindings, run the LLM, wrap output as `{ text }`), and sequential `map` (a body per list item, with `item` + `prior` — earlier iterations' outputs — collected into per-name lists). Bindings are dotted paths; values render into template placeholders by the dual rules (string verbatim, `{ text }` unwrapped, array-of-`{ text }` joined, else pretty JSON). `runPipeline`/`runPipelineByName`/`loadPipeline`/`listPipelines` are exported, plus `chronicleView` (the dice-free projection the executor is fed) and `renderValue`. Every step is recorded in a trace for inspection. The authored `zoomed` pipeline reproduces the hand-coded `chronicleZoomed` (zoom in beat-by-beat, then summarize).

Not yet wired: structured-output `call`s (schema-aware backend seam, `schemas/`, template frontmatter, the cast/NPC pass) and the inspector's pipeline picker — those are the next increments. Adds a `yaml` dependency.
