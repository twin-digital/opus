---
'@thrashplay/fw-chronicler': patch
---

chronicler: restructure the authored prompt content into sibling directories at the package root — `prompts/<template>.md` (templates, flattened out of `prompts/templates/`), `snippets/<axis>/<name>.md` (the shared snippet pools, moved out of `prompts/`), `examples/<key>.md` (the generated few-shot store), and a new `pipelines/` for authored multi-step pipelines (placeholder for now). `loadChronicleTemplate`/`buildPrompt`/`listPromptOptions`/`loadExamples`/the `gen-examples` script read from the new locations; snippet pools stay shared (per-template overrides remain a future escape hatch). Also fixes the `gen-examples` package script to run under `--conditions=source` so its `@thrashplay/fw-simulation/testing` import resolves to source rather than an unbuilt `dist`.
