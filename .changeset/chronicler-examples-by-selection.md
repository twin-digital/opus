---
'@thrashplay/fw-chronicler': patch
'@thrashplay/farwatch': patch
---

chronicler: tie few-shot examples to the snippet selection instead of picking them independently, so the chronicler's exemplars always match the voice being asked for. `examples` is no longer a pickable axis — it is a `data` placeholder filled from a per-combo store (`prompts/examples/<sorted placeholder=value...>.md`), with an `exampleCount` lever (0 = zero-shot) for how many to include. A combo with no file yet falls back to no examples rather than erroring.

Adds a re-runnable `gen-examples` script (`pnpm --filter @thrashplay/fw-chronicler gen-examples [--force] [--dry-run] [--model=NAME]`) that derives every combination of the snippet axes from `listPromptOptions()` — so it extends automatically as snippets/axes are added — narrates a fixed set of seed adventures in each combination via `claude -p` (default model: sonnet, out-classing the runtime model so the exemplars are strong anchors), and writes one file per combo. The `claude-cli` backend now forwards `options.model` as `--model`. The inspector swaps the examples dropdown for an example-count input.
