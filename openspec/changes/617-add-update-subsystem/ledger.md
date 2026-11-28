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

#609 merged (PR #640). Main merged (ad804cc9, no conflict). The relation "blocked by #609" is removed.

## Pre-flight scan

| Row                                       | Checked                                                                                     | Found                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Task 1 x Tasks 2, 3, 4                    | Task 1 produces createUpdate, checkBehaviors, NativeBehavior, Tick; the others consume them | Names agree with "Interfaces" of design.md.   |
| Task 3 x Task 4                           | Task 3 produces behaviors of sample-product; Task 4 loads it as the product code            | Agrees.                                       |
| Tasks 2, 3, 4 x the architecture document | Each changes render.mjs and the SVG files                                                   | One after the other; each task renders again. |
| Tasks 2 to 4 x #541 (PR #610, merging)    | #541 changes render.mjs, the SVG files, and the architecture README                         | Merge main after #610 merges, before Task 2.  |
| Task 4 x break-tests #645, #646, #647     | #647 changes the tests of construct-manager                                                 | The second to merge merges main first.        |
| Task 1 alone                              | A new package: pnpm install and pnpm sync                                                   | The implementer runs them under the lock.     |

Ruling: merge main into this branch after #610 (#541) merges and before Task 2 is dispatched — the container diagram changes in both — cost if wrong: a conflict in render.mjs.

## Tasks

Task 1: dispatched (implementer: sonnet), base ad804cc9

Task 1: implementer DONE, commit 23ebb4b0 (update 29 tests; lint, typecheck, build pass; the first run failed; 1.5 checked with node:path). Choices: clock, core, hub are dependencies (not dev); tick.ms is 0 when the payload has no number ms; the messages of checkBehaviors. Review dispatched (sonnet).
Task 1: review (sonnet): spec compliant, quality Approved, no Critical or Important. Items it could not verify: 1.5 and the runs (in the report; task-1-red.txt holds the RED run).
Task 1: minor (deferred): checkBehaviors accepts a sparse array (forEach skips holes) and returns the caller's array, not a frozen copy; runBehavior finds each entity again for each behavior (O(n²)); no test of a behavior that returns a non-object.
Task 1: complete (commits ad804cc..23ebb4b, review clean)
Task 2: waits for the merge of #610 (#541), and for the answer of the owner on the form of the container diagram (asked in the session, 2026-11-28).
