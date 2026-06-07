---
'@thrashplay/fw-chronicler': minor
---

chronicler: structured-output `call` steps, and the cast/NPC two-pass pipeline they enable.

- A template may declare an output schema in YAML frontmatter (`out: <name>` → `schemas/<name>.json`, plain JSON Schema). A `call` to such a template yields validated structured JSON instead of prose; templates with no frontmatter stay prose (`{ text }`). `loadTemplate(name)` parses frontmatter and strips it from the prompt body (used by `buildPrompt`/`listPromptOptions`).
- `requestStructured(llm, prompt, schemaName, options?, retries?)` is the portable structured-output path: it appends the schema + a JSON-only instruction, extracts the JSON from the completion (tolerating prose / ```json fences), validates with ajv, and re-prompts with the error on failure. The backend seam stays text-in/text-out, so it works across claude-cli/ollama/bedrock; a backend with native structured output can override it behind the same call later.
- New `cast-zoom` pipeline: for each beat a loremaster names the **new** people and places it introduces (structured, `schemas/cast.json`), then the chronicler narrates the beat using that named cast (`single-trial-cast` template); the casts are collected across beats into one persistable list — a seed for world-state that outlasts the run. Adds an `ajv` dependency (catalog).
