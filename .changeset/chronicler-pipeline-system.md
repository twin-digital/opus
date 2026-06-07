---
'@thrashplay/fw-chronicler': minor
'@thrashplay/farwatch': patch
---

chronicler: authored, multi-step narration pipelines.

A pipeline (`pipelines/<name>.yaml`) is a list of steps that pass named JSON values through a lexically-scoped context: `derive` (pure transforms — `pick`/`flatten`/`zip`), `call` (fill a template from dotted-path bindings, run the LLM), and sequential `map` (a body per list item, with `item` + `prior` — earlier iterations' outputs — collected into per-name lists). Values render into placeholders by dual rules (string verbatim, `{ text }` unwrapped, array-of-`{ text }` joined, else pretty JSON), and every step is recorded in a trace for inspection. A `call` whose template declares an output schema in YAML frontmatter (`out: <name>` → `schemas/<name>.json`) yields validated structured JSON instead of prose (`{ text }`): `requestStructured` appends the schema + a JSON-only instruction, extracts and validates with ajv, and re-prompts on failure — and threads the schema down to the backend so the ollama backend constrains generation via its `format` field, while backends without native support fall back to the portable parse/retry path.

Three pipelines ship:
- **`zoomed`** — narrate one trial at a time (each given the aim and the story so far, via the `single-trial` template), then distil the beats into one finished chronicle (`summary`); markedly richer than one-shot whole-adventure narration.
- **`texturized-zoom`** — per beat a loremaster names the **new** people and places introduced (structured, `schemas/cast.json`), the chronicler narrates using that named cast, and the casts collect across beats into one persistable list — a seed for world-state that outlasts the run.
- **`framing-and-texture`** — a per-adventure pre-pass (one structured `treatment` call given the whole adventure at once) authors a coherent bible — setting, fleshed-out non-fungible treasures, a cast with roles and motivations, an inventory, and a per-trial outline (each trial's real obstacle, why it bars the objective, how the approach met it, the consequence into the next, which treasure it wins) — then each trial is narrated by *dramatizing* its framing against the shared setting/cast, and a light stitch joins the passages and lands the closing. Fixes the disjointed, vague results of beat-by-beat narration.

Adds `yaml` and `ajv` dependencies.
