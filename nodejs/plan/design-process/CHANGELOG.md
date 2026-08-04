# @twin-digital/design-process

## 0.4.0

### Minor Changes

- b6062c1: Draft increments in the merge gate and the fold.

  An increment being worked lives at `products/<product>/increments/wip-<NNN>-<slug>/` on its own
  branch. The ordinal orders the drafts one tree holds and claims no published number; landing
  renames the directory into the next published number before the merge.

  - `check` reads a draft increment as it is worked: its sources validate against their schemas,
    its citations resolve, and its proposed decisions and open questions are reported — every
    per-increment rule applied to it as to a published increment. The wip directory always draws
    the `increment-dir-name` finding, so `check` never exits 0 while a draft is in flight, and the
    landing rename is what clears it. Two drafts sharing an ordinal draw the new
    `draft-ordinal-unique` finding.
  - The density gate, record coverage completeness, and the change rules stay on published
    numbers. A wip ordinal neither fills a gap nor makes one, and an implementation record folds
    at its numeric target with drafts excluded, so it lands cleanly in a tree holding one.
  - `show` with no fold version folds the tree as it stands, drafts after every published
    increment in ordinal order — their foundations in the fold, their supersessions closing what
    they name, and their claims counted in the coverage summary. A draft shows under its directory
    name. Naming a version with `--at` or `--at-ref` projects published state and leaves drafts
    out, as `where` and `diff` do.
  - `conflicts` covers a draft increment at its wip directory, alongside the directories numbered
    above the head.

  A directory beginning `wip-` that misses the grammar is not a draft increment: it draws the
  `increment-dir-name` finding worded for the wip form, and its sources are read by nothing.

  `IncrementRef = number | string` joins the entry point's exports — a published number, or a
  draft increment's directory name. `FoldedClaim`, `OutOfForce`, `AddedClaim`, and `ClosedClaim`
  carry it, and `Fold` gains `label` and `drafts`. The change widens the surface and breaks no
  consumer.

## 0.3.0

### Minor Changes

- 2c5567b: The backlog, parallel drafting, and a single entry point.

  New commands:

  - `backlog add|list|search|show|update|delete|send` works a product-keyed markdown backlog on
    an orphan `backlog` branch. Writes go through git plumbing, so capturing an item never
    touches the working tree or the checked-out branch. `send` copies an item into an
    increment's `drafts/backlog/` and drops it from the branch in one action.
  - `where <product> [--at <increment> | --at-ref <gitref>] [--next]` names the product's latest
    published increment at a fold version, or the number a landing would claim.
  - `diff <product>` with a `--from` and an optional `--to` reports the foundations added,
    amended, superseded, and retired between two folds.
  - `conflicts <product> [--against <increment> | --against-ref <gitref>]` runs the landing check
    against the fold at head, exiting non-zero on an id the head already declares or a closure
    aimed at an entry already closed.

  A fold version is two parameters, not one: the bare parameter names an increment and its
  `-ref` counterpart names a git ref, and giving both is an error. `show` gains `--at-ref`
  alongside `--at`. An increment argument takes padding or not — `--at 9` and `--at 009` name the
  same increment — because nothing is inferred from an argument's form.

  `parseFoldVersion` changes shape with them: it reads a flag pair rather than sniffing a single
  argument, and the `FoldVersionFlags` type joins the entry point's exports.

  The package exports a single `.` entry point. The `./*` subpath wildcard is gone, so modules
  under `src/` are no longer importable and internal structure is free to move.

## 0.2.0

### Minor Changes

- e239529: Support the `deferred` decision status (decisions sources at version 2). A deferred decision
  stays in force for citations but is not coverable: `check` rejects a coverage entry naming one
  (`record-covers-deferred`) and no longer counts an omitted deferral as a coverage gap, and
  `show` counts deferred entries beside the rulings while excluding them from the coverage
  section, its summary naming how many were excluded.

## 0.1.0

### Minor Changes

- 28d30fe: Initial release: `design-process check` (the design merge-gate validator), `design-process
show` (the folded product projection), and `design-process id` (the opaque-id generator).
