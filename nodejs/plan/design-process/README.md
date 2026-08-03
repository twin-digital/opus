# @twin-digital/design-process

Tooling for the twin-digital incremental design process: the merge-gate validator, the
projection, and the opaque-id generator. The process itself is defined by the documents shipped
from the [plan-opus](https://github.com/twin-digital/plan-opus) repository under `docs/`.

## Usage

```sh
design-process check [--root <dir>] [--base <ref>] [--static-only]
design-process show <product> [--root <dir>] [--at <n>] [--facet <facet>]
design-process id <r|d|q> [--root <dir>] [--count <n>]
```

### check

Applies every design rule in force to the repository tree; any finding blocks the merge. Exits
non-zero when findings exist. Two rule groups run:

- **Tree-state rules** — pool identity and `$ref` resolution, schema validation of every
  structured file against the pool schema its `version` names, id format and uniqueness, no
  `proposed` decisions, no open questions, citations resolve (never to a question, and no in-force `because:` or `informed_by:` rests on a retired fact), model
  bindings resolve, preset adoption rules, dense increment numbering, implementation-record
  naming and claim scope.
- **Change rules** — compared against `--base` (default `origin/main`, then `main`): published
  increments are immutable, shipped implementation records are immutable, pool versions bound by
  a published increment are immutable (directly or through a bound schema's `$ref`), and a new
  implementation record targets the newest published increment.

Findings cite the requirement or decision id each rule enforces, e.g.:

```
✖ [published-immutable] products/demo/increments/001/decisions.yaml: edited in a published increment (r-caao9k3z)
```

### show

Renders the folded, effective state of a product at an increment as markdown: requirements
(local and adopted), decisions ordered by `because:` topology with statuses and pins, model
bindings, coverage joined from the `implementations/` pool with uncovered and attestation-only
counts, and what the increment changed.

### id

Generates opaque ids — `{r|d|q}-` plus 8 random lowercase base36 characters — unique against
every id mentioned under `products/`.
