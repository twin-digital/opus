---
"@twin-digital/design-process": minor
---

The backlog, parallel drafting, and a single entry point.

New commands:

- `backlog add|list|search|show|update|delete|send` works a product-keyed markdown backlog on
  an orphan `backlog` branch. Writes go through git plumbing, so capturing an item never
  touches the working tree or the checked-out branch. `send` copies an item into an
  increment's `drafts/backlog/` and drops it from the branch in one action.
- `where <product> [--at <version>] [--next]` names the product's latest published increment
  at a fold version, or the number a landing would claim.
- `diff <product> --from <version> [--to <version>]` reports the foundations added, amended,
  superseded, and retired between two folds.
- `conflicts <product> [--against <version>]` runs the landing check against the fold at
  head, exiting non-zero on an id the head already declares or a closure aimed at an entry
  already closed.

Wherever a command takes a fold version, a three-digit argument names an increment number and
anything else names a git ref. `show --at` widens accordingly: `--at 009` is increment 9,
while `--at 9` now names a git ref.

The package exports a single `.` entry point. The `./*` subpath wildcard is gone, so modules
under `src/` are no longer importable and internal structure is free to move.
