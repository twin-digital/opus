---
'@twin-digital/design-process': minor
---

The backlog, parallel drafting, and a single entry point.

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
