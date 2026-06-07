---
'@thrashplay/fw-chronicler': patch
'@thrashplay/farwatch': patch
---

farwatch inspector: run and tune pipelines (and standalone templates) from the form.

A single run-target dropdown lists both templates and pipelines. A pipeline run feeds the chronicle-legal view through the executor and shows the declared chronicle output plus the full per-step trace (each call's prompt, every step's output) in the guts. Its config section is **one group per call-node** (keyed by the step's `as`): a template dropdown of the templates whose bindings that node can satisfy (defaulting to the authored one) that, on change, rebuilds the snippet dropdowns for the chosen template — so you can iterate on which template runs where, and how, without editing the pipeline YAML. This is backed by `describePipelineNodes(name)` (the call-nodes, each with its bind-compatible template choices, their axes, and the pipeline's defaults) and `runPipeline`'s `nodeOverrides` (keyed by `as`, supplying a node's template and/or snippet selection; a node feeds an overriding template only the data placeholders it declares).

Single-template runs go through a generated skeleton pipeline that derives the standard adventure values (aims, party, trials, outcome, …) and binds the template's placeholders to them — so an adventure-level template like `treatment` can be run and inspected on its own (returning its structured JSON) instead of erroring. The picker only offers standalone-runnable templates: those with dedicated handlers (`chronicle`, `single-trial`) plus any whose data placeholders are all standard adventure values; the rest (per-trial / prior-bound steps) are reached via their pipeline. `listPromptOptions().templateUses[name]` reports each template's `data` placeholders so a caller can tell which are standalone-runnable.
