# @thrashplay/farwatch

## 0.1.0

### Minor Changes

- a238fe3: feat(farwatch): model an adventure as an ordered, variable-length run of trials.

  `resolveAdventure` returns an `Adventure` — `{ trials, outcome }`, where each `Trial` wraps a single `Check` (`roll`/`target`/`outcome`) — instead of a flat result. The trials resolve in order and the chain's last trial decides the overall outcome, so a longer adventure is a longer build. The trial count is a per-adventure weighted draw (`trialCountWeights` in `config/adventure.yaml`, defaulting to 3–6 skewed toward 4–5), tunable like the other generation tables. The chronicler reads the trial outcomes in order (told to join beats with "but"/"therefore", never "and then"), and the inspector renders the trial chain.

- a238fe3: feat(farwatch): an `ollama` chronicler backend with per-call model selection.

  Select with `CHRONICLER_LLM=ollama`; it calls a self-hosted Ollama server's `POST /api/generate` (non-streaming), thinking disabled. Configure the server with `OLLAMA_HOST` (a bare `host:port` is accepted; defaults to localhost) and the default model with `CHRONICLER_MODEL`. The `Llm` surface gains an optional `options` arg (`{ model?, params? }`), so a model and extra generation params can be passed per call rather than only via env. The inspector adds a **model dropdown** populated on load from the server's installed models (`listOllamaModels()` → `GET /api/tags`), sent with each run. Also fixes `main.ts` loading `.env` from the wrong directory (now the repo root, matching `serve.ts`).

- a238fe3: feat(farwatch): the adventure goal & resource economy.

  An adventure carries a **goal** — a weighted reward (a fungible tier, or a non-fungible `item`/`secret`) with a viability flag; an adventure whose goal was never there to win (`viable: false`) clamps to `outcome: 'failure'` regardless of how the trials went. Around it, each trial realizes its own resource movements: a few approaches pay an upfront **cost** (win or lose — `wealth` lays down coin, `sacrifice` gives something up), a failed trial forfeits its **stake**, and a won trial may yield a **prize** (any resource kind). Two kinds of secondary goal layer on top: **optional goals** bound to distinct trials (a weighted 0–n count; that trial's prize becomes the optional reward, won by winning the trial), and **unknown goals** a winning trial discovers by chance (`unknownSpawnChance`, drawn with their own tier weights that can skew large). The goal's reward is carried home exactly on overall success.

  Every movement is attributed — to its trial (`cost`/`stake`/`prize`), its optional goal, the discovered goal, or the goal reward — and assembled into an itemized **ledger**. Generation weights live in editable **YAML under `config/`**, validated by **zod** schemas keyed against the real resource/approach vocabulary. Adds a `RESOURCE_INFO` catalog, a `pickWeighted` map picker, and a `@thrashplay/fw-simulation/testing` factory (`makeAdventure`/`makeTrial`) so fixtures don't break as the model grows. The dev inspector's guts panel gains readable **Goals** (primary + viability, optionals won/missed, discoveries) and **Ledger** (itemized gains/losses) sections.

### Patch Changes

- a238fe3: chronicler: composable, A/B-testable prompts driven by a builder UI.

  A prompt is a named template composed from two fill channels — **snippets** (a placeholder `{{writing_style}}` is filled from `snippets/writing-style/<name>.md`, the directory being the placeholder name by convention) and **data** (runtime strings like the serialized adventure). `buildPrompt(spec)` validates that the channels exactly cover the template's placeholders, failing loudly on an unfilled placeholder, a stray fill (typo), a both-channels collision, or a missing snippet file; `buildChroniclePrompt(adventure, overrides?)` applies the default selection and supplies the adventure data, with `overrides` swapping a single snippet or the whole template for comparison. The chronicle voice is split into orthogonal axes that compose: **register** (the narrator's stance: legendary, saga, annalist, antiquarian, folktale, gritty) and **writing_style** (how ornate the prose is: mythic vs plain), plus **invention** (how far to flesh out). Few-shot examples are tied to the snippet selection rather than picked independently — `examples` is a `data` placeholder filled from a per-combo store (`examples/<sorted placeholder=value…>.md`) with an `exampleCount` lever (0 = zero-shot), falling back to no examples when a combo has no file yet. A re-runnable `gen-examples` script (`pnpm --filter @thrashplay/fw-chronicler gen-examples [--force] [--dry-run] [--model=NAME]`) derives every axis combination from `listPromptOptions()`, narrates seed adventures in each via `claude -p` (default sonnet, to anchor strong exemplars), and writes one file per combo. `listPromptOptions()` discovers templates and snippet axes from disk by convention and reports, per template, the axes and data placeholders it uses and whether it has an examples slot. Authored content lives in sibling package-root directories — `prompts/<template>.md`, `snippets/<axis>/<name>.md`, `examples/<key>.md`, `pipelines/` — read fresh on each call so edits show up live with no rebuild.

  farwatch inspector: a prompt-builder form replaces the monolithic override textarea — one dropdown per snippet axis, populated from `GET /options` so a new snippet file appears with no code change, with the input column left of the chronicle output and the composed prompt shown read-only in the guts. The form is template-aware: selecting a template shows only the axes it uses, plus the example-count lever only when it has an examples slot (so `single-trial` shows no irrelevant example count), and snippet picks persist across template switches where the axis still applies.

- a238fe3: chronicler: a per-adventure diversity palette to break setting mode-collapse.

  Left to its own devices each model collapses every adventure onto one prototype setting (an ossuary, a drowned vault) however varied the facts. `derivePalette(adventure)` rolls a hint — a biome, a scale, its inhabitants, and an _adventure type_ (heist / hunt / mystery / rescue / …) derived from the goal kind or dominant approach — deterministically from the adventure (a stable hash, so a seed always yields the same palette), drawn from an editable `palette.yaml`. The **framing-and-texture** treatment is given the palette as raw material to react to, de-clustering the settings it authors. How hard the hint is imposed is itself an A/B axis: the new `grounding` snippet (`strict` hard-anchors onto the palette and resists reverting to the prototype, `loose` offers it as a suggestion). The inspector supplies the palette as a standard input, so any pipeline can bind it.

- a238fe3: farwatch inspector: run and tune pipelines (and standalone templates) from the form.

  A single run-target dropdown lists both templates and pipelines. A pipeline run feeds the chronicle-legal view through the executor and shows the declared chronicle output plus the full per-step trace (each call's prompt, every step's output) in the guts. Its config section is **one group per call-node** (keyed by the step's `as`): a template dropdown of the templates whose bindings that node can satisfy (defaulting to the authored one) that, on change, rebuilds the snippet dropdowns for the chosen template — so you can iterate on which template runs where, and how, without editing the pipeline YAML. This is backed by `describePipelineNodes(name)` (the call-nodes, each with its bind-compatible template choices, their axes, and the pipeline's defaults) and `runPipeline`'s `nodeOverrides` (keyed by `as`, supplying a node's template and/or snippet selection; a node feeds an overriding template only the data placeholders it declares).

  Single-template runs go through a generated skeleton pipeline that derives the standard adventure values (aims, party, trials, outcome, …) and binds the template's placeholders to them — so an adventure-level template like `treatment` can be run and inspected on its own (returning its structured JSON) instead of erroring. The picker only offers standalone-runnable templates: those with dedicated handlers (`chronicle`, `single-trial`) plus any whose data placeholders are all standard adventure values; the rest (per-trial / prior-bound steps) are reached via their pipeline. `listPromptOptions().templateUses[name]` reports each template's `data` placeholders so a caller can tell which are standalone-runnable.

- a238fe3: chronicler: authored, multi-step narration pipelines.

  A pipeline (`pipelines/<name>.yaml`) is a list of steps that pass named JSON values through a lexically-scoped context: `derive` (pure transforms — `pick`/`flatten`/`zip`), `call` (fill a template from dotted-path bindings, run the LLM), and sequential `map` (a body per list item, with `item` + `prior` — earlier iterations' outputs — collected into per-name lists). Values render into placeholders by dual rules (string verbatim, `{ text }` unwrapped, array-of-`{ text }` joined, else pretty JSON), and every step is recorded in a trace for inspection. A `call` whose template declares an output schema in YAML frontmatter (`out: <name>` → `schemas/<name>.json`) yields validated structured JSON instead of prose (`{ text }`): `requestStructured` appends the schema + a JSON-only instruction, extracts and validates with ajv, and re-prompts on failure — and threads the schema down to the backend so the ollama backend constrains generation via its `format` field, while backends without native support fall back to the portable parse/retry path.

  Three pipelines ship:
  - **`zoomed`** — narrate one trial at a time (each given the aim and the story so far, via the `single-trial` template), then distil the beats into one finished chronicle (`summary`); markedly richer than one-shot whole-adventure narration.
  - **`texturized-zoom`** — per beat a loremaster names the **new** people and places introduced (structured, `schemas/cast.json`), the chronicler narrates using that named cast, and the casts collect across beats into one persistable list — a seed for world-state that outlasts the run.
  - **`framing-and-texture`** — a per-adventure pre-pass (one structured `treatment` call given the whole adventure at once) authors a coherent bible — setting, fleshed-out non-fungible treasures, a cast with roles and motivations, an inventory, and a per-trial outline (each trial's real obstacle, why it bars the objective, how the approach met it, the consequence into the next, which treasure it wins) — then each trial is narrated by _dramatizing_ its framing against the shared setting/cast, and a light stitch joins the passages and lands the closing. Fixes the disjointed, vague results of beat-by-beat narration.

  Adds `yaml` and `ajv` dependencies.

- a238fe3: feat(farwatch): a dev-only web inspector (`pnpm --filter @thrashplay/farwatch serve`) that runs the seed → resolve → chronicle pipeline and shows the chronicle prose beside the fully-exposed guts (the pinned adventure, the exact prompt, and the raw completion) — a debug superset of the eventual player view that hides nothing.

  The render paths make several LLM calls, so failures are made legible: the server logs `/run` start, completion (with elapsed), and failures (full stack) to its terminal, and installs `unhandledRejection`/`uncaughtException` handlers that log and keep serving rather than dying silently. The 500 response carries the stack, and the page shows it in the guts plus a clear hint — on a no-response failure — to check the server terminal, instead of a bare "Failed to fetch".

- Updated dependencies [a238fe3]
- Updated dependencies [a238fe3]
- Updated dependencies [a238fe3]
- Updated dependencies [a238fe3]
- Updated dependencies [a238fe3]
- Updated dependencies [a238fe3]
- Updated dependencies [a238fe3]
- Updated dependencies [a238fe3]
- Updated dependencies [a238fe3]
- Updated dependencies [a238fe3]
  - @thrashplay/fw-chronicler@0.1.0
  - @thrashplay/fw-simulation@0.1.0
  - @thrashplay/fw-core@0.0.1

## 0.0.2

### Patch Changes

- Updated dependencies [2e54b59]
  - @thrashplay/fw-chronicler@0.0.2

## 0.0.1

### Patch Changes

- 914e40a: initial creation of farwatch project
- Updated dependencies [914e40a]
  - @thrashplay/fw-chronicler@0.0.1
  - @thrashplay/fw-simulation@0.0.1
  - @thrashplay/fw-core@0.0.1
