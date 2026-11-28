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
Task 2: #610 (#541) merged; main merged (b72d6f51, no conflict). The owner answered #649: Tasks 2 to 4 add the container `update` to the current diagram; the new form of the diagrams is #650, after #617.
Task 2: dispatched (implementer: sonnet), base b72d6f51

Task 2: implementer DONE_WITH_CONCERNS, commit 9cf0d633 (pixi-page lint, typecheck, test pass, 88; the RED run failed on the missing modules; render stable, check-svg passes). Concerns: the container diagram is 1614 px wide (was 1140), with `update` in a new column on the right (the design placed it differently; #650 revisits the form); renderer-godot (merged after the plan) keeps its own color-rule.ts and wrapper, and the architecture text of the Godot process says "color rule"; the spec link to wishem/update/update-subsystem works after the archive; the arrows from construct-manager and the workbench process to update come in later tasks.
Ruling: the Godot construct moves to a behavior in a follow-up issue (A5), not in this change — the plan did not know of it, and it works as it is — cost if wrong: one more wrapper for a while.
Review dispatched (sonnet).
Task 2: review (sonnet): spec compliant, quality Approved. Minor: render.mjs:726, the card of the PixiJS process still says "Runs the construct with a clock and serves the page" (the README says "with its update subsystem and clock") — Task 3 changes render.mjs and takes it; color-behavior.ts imports ./model.ts (mixed style, as create-hub.ts).
Follow-up issue: #662 (the Godot construct runs its color rule as a native behavior, A5).
Task 2: complete (commits b72d6f5..9cf0d63, review clean)
Task 3: dispatched (implementer: sonnet), base 9cf0d633

Task 3: implementer DONE_WITH_CONCERNS, commit b331172e (sample-product 44 tests; the RED run failed on the missing module; render stable, check-svg, images viewed). Concerns: count-rule.ts, its test, withCountRule and wrapStore stay until Task 4, because the tests of construct-manager and workbench-app import wrapStore (Task 4 removes them and the mentions in the READMEs and the architecture document); the card of the PixiJS process says "Runs the construct with its update subsystem and clock." (two lines only).
Ruling: the remove of withCountRule and wrapStore moves to Task 4 — each task must leave each package green — cost if wrong: none, Task 4 removes them.
Review dispatched (sonnet).
Task 3: review (sonnet): spec compliant, quality Approved. Minor: the card of the PixiJS process no longer says "serves the page" and the table row does (Task 4 makes them agree); a `{ ticks: 1 } as never` cast in count-behavior.test.ts (deferred); the README of sample-product omits wrapStore while index.ts exports it (Task 4 removes it). Task 4 also removes the wrapStore mentions of the architecture README (about lines 58 and 65).
Task 3: complete (commits 9cf0d63..b331172, review clean)
Task 4: dispatched (implementer: sonnet), base b331172e

Task 4: implementer DONE_WITH_CONCERNS, commit b32f24ce (construct-manager 82, workbench-app 303, sample-product pass; lint, typecheck pass; render stable, check-svg, images viewed). Concerns: a failing run before the code only for construct-manager (15 failures), not for workbench-app; the refusal tests of `picky` now use a construct whose entity was removed through constructs/send (a behavior cannot refuse a set-field); Task 5 must fix glossary.md:31 (wrapStore) and the sample-product line of nodejs/wishem/CLAUDE.md ("count rule"); the new arrow construct-manager → update crosses lines, no label; the PixiJS card says "Runs the construct and serves the page."
Review dispatched (sonnet).
Task 4: review (sonnet): needs fixes. Spec ❌ / Important I1: brief 4.3 asks for a workbench-app test that a module with `behaviors` runs the count; each changed test uses `behaviors = []`, so a fault of the wiring in start.ts passes. The reviewer reasoned that the changed tests of workbench-app fail against the old code. Minor: the refusal assertions use toBeTruthy() in place of the text `The color is bad` (construct-manager.test.ts about 303-325 and 515); a double comma and a long line in the doc comment of product-construct.ts; `manager2` and `behaviors[0]` names; glossary.md:31 and CLAUDE.md (Task 5).
Ruling: fix round 1 takes I1, the refusal text, and the doc comment; the names stay deferred; the glossary and CLAUDE.md stay in Task 5 — cost if wrong: small.
Task 4: fix round 1 dispatched (new implementer, sonnet), base b32f24ce.
Task 4: fix round 1 DONE, commit 4d7bea8c. I1: the implementer found the test 'prints the product code after the product, and runs a product construct whose count advances' in start.test.ts, which runs the real count behavior; with behaviors: undefined in start.ts it failed (expected 0 to be greater than 0), so no new test. Refusal assertions now check exact text; doc comment fixed. Scoped re-review dispatched (sonnet).
Task 4: re-review (sonnet): I1 ADDRESSED (start.test.ts:685-721 runs the real count behavior; start.ts:188 and :217 pass behaviors), refusal text ADDRESSED, doc comment ADDRESSED; no new breakage. Deferred minor: the names manager2 and behaviors[0].
Task 4: complete (commits b331172..4d7bea8, review clean)
Task 5: dispatched (implementer: sonnet), base 4d7bea8c
Task 5: implementer DONE_WITH_CONCERNS, commit f7ac188c
Ruling: the repo-wide grep keeps hits in renderer-godot (color-rule.ts, create-hub.ts, README) and docs/architecture/README.md "color rule" for renderer-godot — change 617 does not move the Godot construct, and those lines match its code — if wrong, a follow-up issue renames them.
Ruling: start.test.ts:819 keeps the name wrapStore — it is a negative test that expects a refusal — cost if wrong: one stale name in a test.
Task 5: review (sonnet): spec ❌ — glossary "Native behavior" names count behavior and color behavior with no **Proposed** mark; quality Needs fixes (that one Important). Fix round 1 dispatched (fresh sonnet implementer), FIX_BASE f7ac188c
Task 5: fix round 1/5 (1 addressed, 0 open — Proposed marks; commits f7ac188..2f648cf)
Task 5: complete (commits 4d7bea8..2f648cf, review clean)
Merge of origin/main (a31f4a13): no conflict; construct-manager tsc + vitest 90/90 pass.
Final review: dispatched (opus), package review-f52907f6..a31f4a13.diff, with the test guide
Final review (opus): not ready — I1 root README list (update, sample-product "rule"); I2 concepts.md:327-335 table not Prettier; I3 delta architecture/diagrams drops two Godot scenarios of #541 (validate --strict fails); I4 check-behaviors.ts:8 text differs from spec ("The behaviors are not a list."). Test guide: all pass except 17 (I4); 7 manual key presses not done (no browser); 8 mismatch (pnpm exit 0, no signal). Ledger triage: none must be fixed. Fix wave dispatched (sonnet), FIX_BASE a31f4a13
Final fix wave: implementer done, commit 5f9f763e (I1-I4 + step 8 text). Scoped re-review dispatched (sonnet).
Final fix wave: re-review (sonnet): I1-I4 and step 8 ADDRESSED; no new breakage. Final review clean.
