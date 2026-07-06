# @thrashplay/fw-chronicler

Turns a **resolved adventure** (pinned simulation facts) into narrative prose through an LLM. The
simulation decides _what happened_; the chronicler decides _how it is told_ — and is built to make
that telling tunable and A/B-testable rather than hardcoded.

This README is the **orientation + recipes** for authoring and extending the chronicler. For what the
terms mean (Template, Snippet, Axis, Register, Treatment, Chronicle view, Pipeline, …), see the
**Chronicler implementation** section of [`docs/farwatch/glossary.md`](../../../docs/farwatch/glossary.md);
this doc assumes that vocabulary and shows where each concept lives and how to add to it.

## Layout

Authored content is plain Markdown / YAML at the package root (siblings of `src/`), so the same
relative path resolves in dev and in the built `dist/` with no asset copy, and files are read **fresh
on each call** — edits show up live in the inspector with no rebuild.

```
prompts/<template>.md          templates — skeletons with {{placeholder}} markers (+ optional `out:` frontmatter)
snippets/<axis>/<name>.md      shared snippet pools — one directory per axis
examples/<key>.md              generated few-shot store, keyed by the snippet selection
pipelines/<name>.yaml          authored multi-step narration
schemas/<name>.json            JSON Schemas for structured-output calls
```

The structure is **convention-driven**: a directory under `snippets/` _is_ an axis, a file under it
_is_ an option, a `{{placeholder}}` in a template _is_ a slot. `listPromptOptions()` discovers all of
it from disk, and the inspector renders it from there — so most additions below are "drop a file," no
code change.

## The prompt-builder contract

`buildPrompt(spec)` (in `src/chronicle.ts`) composes one template from two fill channels and validates
that they **exactly** cover the template's placeholders (failing loudly on an unfilled placeholder, a
stray fill, a both-channels collision, or a missing snippet file):

- **snippets** — `{{writing_style}}` is filled from `snippets/writing-style/<name>.md` (the directory
  is the placeholder name, `_`→`-`). File-backed and interchangeable: the A/B surface.
- **data** — runtime strings with no file (the serialized **chronicle view**, the few-shot examples).

`buildChroniclePrompt(adventure, overrides?)` is the chronicle-specific convenience: it applies the
default selection (`CHRONICLE_DEFAULTS`) and supplies the adventure data, with `overrides` swapping a
single snippet or the whole template.

## Recipes

**Add a snippet (new option on an existing axis).** Drop `snippets/<axis>/<name>.md`. It appears in
the inspector immediately. To make it the default for the chronicle template, update
`CHRONICLE_DEFAULTS`.

**Add an axis (new dimension of variation).** Create `snippets/<new-axis>/` with one or more options,
then reference `{{new_axis}}` in whatever template(s) should vary on it. Any template that contains
the placeholder gains the dropdown; templates that don't are unaffected (axes are independent).

**Add a template.** Drop `prompts/<name>.md` with `{{placeholder}}` slots — snippet axes for the
file-backed ones, data placeholders for runtime values. If every data placeholder is a standard
adventure value (see `STANDARD_BINDINGS` in `app/src/serve.ts`), the inspector can run it standalone;
otherwise it is reached as a step inside a pipeline.

**Add a structured-output template.** Give the template `out: <schema>` frontmatter and add
`schemas/<schema>.json` (plain JSON Schema). A `call` to it returns validated JSON instead of prose
(`{ text }`); `requestStructured` appends the schema + a JSON-only instruction, validates with ajv,
and re-prompts on failure — and threads the schema to backends with native support (ollama's
`format`). See `prompts/treatment.md` + `schemas/treatment.json`.

**Add a pipeline.** Drop `pipelines/<name>.yaml`: declare its `in:` inputs and `out:` results, a
`config:` of default snippet selections per template, and `steps:` of `derive` (pure transforms —
`pick`/`flatten`/`zip`), `call` (run a template — bind its placeholders from dotted paths), and `map`
(a body per list item, with `item` + `prior`). Values render into placeholders by the dual rules
(string verbatim, `{ text }` unwrapped, array-of-`{ text }` joined, else pretty JSON). The executor
lives in `src/pipeline.ts`; `zoomed.yaml` is the simplest worked example.

**Regenerate the few-shot examples.** After changing voice snippets, re-run
`pnpm --filter @thrashplay/fw-chronicler gen-examples [--force] [--dry-run] [--model=NAME]`. It
derives every axis combination from `listPromptOptions()` (so it extends automatically), narrates a
fixed set of seed adventures in each via `claude -p` (default: sonnet), and writes one
`examples/<key>.md` per combo.

## The inspector

A dev-only web inspector (`pnpm --filter @thrashplay/farwatch serve`, default port 4178) runs the
seed → resolve → chronicle pipeline and shows the prose beside the fully-exposed guts (the pinned
adventure, the exact prompt sent, the raw completion). It is the loop for iterating on prompts.

- `GET /options` serves what's on disk (templates, axes, defaults, pipelines) via `listPromptOptions`
  and `describePipelineNodes` — which is why a new snippet/axis/template needs no UI code.
- A pipeline's config is **one group per call-node** (keyed by the step's `as`): a template dropdown
  of the templates whose bindings that node can satisfy, plus the snippet dropdowns for the chosen
  template — so you can swap which template runs where, and how, without editing the YAML. This is
  backed by `runPipeline`'s `nodeOverrides`.
- The server (`app/src/serve.ts`) and page (`app/src/inspector.html`) are where UI changes go; the
  data they render comes from the chronicler's `src/` discovery functions.

## Backends

`selectLlm()` (in `src/llm.ts`) picks a backend from `CHRONICLER_LLM` and fails fast if unset:
`ollama` (self-hosted, per-call model selection, native structured output), `claude-cli`
(`claude -p`), or `bedrock`. The backend seam is text-in/text-out with an optional `schema`, so
templates and pipelines are backend-agnostic.

## Where things are

| Concern                                                     | Code                                               |
| ----------------------------------------------------------- | -------------------------------------------------- |
| Prompt composition, template/snippet/example discovery      | `src/chronicle.ts`                                 |
| Pipeline executor, `describePipelineNodes`, `nodeOverrides` | `src/pipeline.ts`                                  |
| Structured output (schema append, extract, validate, retry) | `src/structured.ts`                                |
| Diversity palette (biome/scale/inhabitants/adventure-type)  | `src/palette.ts`                                   |
| Backends                                                    | `src/{ollama,claude-cli,bedrock,llm}.ts`           |
| Inspector server + page                                     | `../app/src/serve.ts`, `../app/src/inspector.html` |
