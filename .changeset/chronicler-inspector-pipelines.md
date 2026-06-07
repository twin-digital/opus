---
'@thrashplay/fw-chronicler': patch
'@thrashplay/farwatch': patch
---

chronicler: add `describePipeline(name)` — a pipeline's configurable surface (each template it calls, the snippet axes that template uses, and the pipeline's default selection) — so a UI can build per-pipeline controls.

farwatch inspector: the form is now run-target aware. A single dropdown lists both templates and pipelines (as optgroups); picking a template shows its snippet axes (+ example count), while picking a pipeline shows a snippet-config group per template it calls, seeded from the pipeline's YAML defaults and overridable for testing. A pipeline run feeds the chronicle-legal view through the executor and shows the declared chronicle output plus the full per-step trace (each call's prompt, every step's output) in the guts. `/options` now also returns the available pipelines and their config metadata.
