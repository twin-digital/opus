# grinbox design

The design artifacts for grinbox, colocated with the code they constrain.

- **`directives.md`** — the owner's requirements, in the owner's words, near-verbatim.
  Prose here is human-spoken; machine-drafted text is marked `proposed` and binds nothing.
- **`durable-core.yaml`** — the computed inventory of surfaces with consumers outside this
  workspace. Every entry names the consumer that breaks without it; nothing is asserted by
  judgment. Regenerate by re-running the walk it describes.
- **`model/`** — machine-derived structure: entities, state machines, invariants. Model
  elements are checked, not ruled — each invariant names the test that enforces it, and an
  element has standing only through its checks and its `trace` to a directive.

Slices are modeled when they are next touched, not transcribed wholesale. The retired
prose corpus in `plan-opus` is the read-only shadow corpus: new designs may be diffed
against it, and differences come back as questions.
