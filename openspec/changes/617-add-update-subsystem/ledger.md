# SDD ledger — plan: openspec/changes/617-add-update-subsystem/tasks.md

Plan commit 2a23d000 (planner on opus, with openspec-propose), on main at d8233331 (with #538). Five tasks. The planner found no question that meets the three conditions for the owner. Its decisions are in design.md.

## For the review issue of the milestone A4

- A new private package `@thrashplay/wishem-update` (name **Proposed**). It depends on `core`, `hub`, and `clock`.
- A native behavior is `{ id, componentType, update(fields, tick) }`, a pure function with no entity ID and no joined state. The behaviors run in list order over the entities in store order.
- A behavior that throws, or a value that the store refuses, refuses the whole tick.
- The product code exports `behaviors` in place of `wrapStore`. `withCountRule`, `wrapStore`, and `withColorRule` are removed.
- No phases (rule R7).

## Order with other changes

- #609 (PR #640) merges first. The relation "blocked by #609" on #617 records the order. The apply merges main before Task 1, and Task 3 writes `countBehavior` in the number form of #609.
- #541 (PR #610): no shared code; the second to merge writes the container diagram again (a new container `update`).

## Tasks

No task is dispatched. NEXT STEP: after #609 merges, merge main, then the pre-flight scan, then Task 1.
