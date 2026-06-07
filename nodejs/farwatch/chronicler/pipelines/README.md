# pipelines

Authored, multi-step narration pipelines (YAML) — chains of `call` / `derive` / `map` steps that
pass named JSON values through a context. A pipeline's structure is fixed in YAML; the inspector
picks a pipeline and lets you override the snippet selection for each template it uses (YAML supplies
the defaults).

This directory is a placeholder: the pipeline schema, executor, and UI are not built yet. The
authored prompt content they compose lives alongside:

- `../prompts/<template>.md` — templates
- `../snippets/<axis>/<name>.md` — shared snippet pools (per-template overrides may shadow these later)
- `../examples/<key>.md` — generated few-shot store, keyed by snippet selection
