# SDD ledger — plan: openspec/changes/537-list-and-change-things/tasks.md

Spec: openspec/changes/537-list-and-change-things/specs/ (six deltas) and design.md. Global constraints: the plan header (tests first with a failing run; lint/typecheck/tests only for the task packages, under the lock; a UI task runs test:ui:update then test:ui).

## Pre-flight scan

| Pair or task | Produces / consumes                                                                                                                  | Found                                                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1 → T4      | T1 exports `sendInput` (renderer-react) and `outcomeText(…, subject)` in workbench-app/src/outcome-text.ts; T4 ProductTool uses both | consistent: T4 runs after T1                                                                                                                                                                                  |
| T2 → T3      | T2 builds `FieldRow`; T3 EntityInspector draws one FieldRow for each field                                                           | consistent                                                                                                                                                                                                    |
| T2 ↔ T3      | both change style-guide/sections/Components.tsx and components-light/dark.png                                                        | sequential: T3 adds specimens after T2 and updates the same baselines; no conflict                                                                                                                            |
| T3 → T4      | T3 builds ProductPanel, entityName, shortId; T4 ProductTool wraps ProductPanel                                                       | consistent                                                                                                                                                                                                    |
| T4 → T5      | T4 puts the panel in the page; T5 drives it in the real workbench                                                                    | consistent                                                                                                                                                                                                    |
| T4 ↔ #617    | T4 changes docs/architecture/README.md, render.mjs, glossary.md, concepts.md; #617 (final review now) changes the same files         | Ruling: merge main before Task 4 if #617 is merged by then, else the second to merge follows "Order with other changes" of design.md — the plan names both orders — cost if wrong: one merge conflict in docs |
| T1           | tests of sendInput (1.1) against the export (1.2); outcome-text move (1.4) changes the AppBar import                                 | agrees with itself                                                                                                                                                                                            |
| T2           | unit tests (2.1) against FieldRow (2.2); specimens (2.3)                                                                             | agrees with itself                                                                                                                                                                                            |
| T3           | tests (3.1) against the three components and two functions (3.2)                                                                     | agrees with itself                                                                                                                                                                                            |
| T4           | 4.3 asks for a failing run before 4.2, "or report why they cannot"                                                                   | agrees with itself                                                                                                                                                                                            |
| T5           | one script; verifies with real processes                                                                                             | agrees with itself                                                                                                                                                                                            |

## Tasks

Task 1: dispatched (implementer: sonnet), base e49306cd
Task 1: implementer DONE_WITH_CONCERNS, commit 19d0fa89 (start.test.ts and generate.test.ts of workbench-app fail: dependency dist not built in this worktree; lead builds them)
Task 1: review (sonnet): spec compliant except one Extra; quality Needs fixes. Important: stray empty file nodejs/wishem/renderer-react/timeout. Minors in task-1-review.txt (deferred to the final review). Lead built workbench-app deps (turbo build workbench-app^..., 13 ok). Fix round 1 dispatched (fresh sonnet), FIX_BASE 19d0fa89
Task 1: fix round 1 implementer done, commit ee7c9a1c (stray file removed; workbench-app 305/305 incl. start and generate tests). Re-review dispatched (sonnet).
Task 1: fix round 1/5 (1 addressed, 0 open — stray file; commits 19d0fa8..ee7c9a1)
Task 1: complete (commits e49306c..ee7c9a1, review clean)
Task 2: dispatched (implementer: sonnet), base ee7c9a1c
Task 2: implementer DONE, commit 7b586251 (39 new tests failed first; workbench-app 345 pass; test:ui 60 pass; only components baselines changed). Concerns: row grid switches at the viewport md breakpoint, not container width; reference rows show the disabled "No value" option, not the mono label.
Ruling: the changeset step follows ~/.claude/rules/changesets.md — one changeset file for each distinct change (a "New package" file, one for each notable API or behavior, and one combined patch only for the same change across packages), not one file for all packages as the plan says — the owner rule overrides the plan — cost if wrong: a few more changeset files.
Task 2: review (sonnet): spec compliant, quality Approved; five Minors in task-2-review.txt (deferred, for the final review).
Task 2: complete (commits ee7c9a1..7b58625, review clean)
Task 3: dispatched (implementer: sonnet), base 7b586251
Task 3: implementer DONE_WITH_CONCERNS, commit 9b2431e9 (379/379 unit, test:ui 60/60; only components baselines). Concern: added an optional `stacked` prop to style-guide Section so the 720 px panel specimen fits; components section is now one column (light above dark).
Task 3: review (sonnet): spec compliant (extra: opt-in `stacked` prop, needed), quality Approved; Minors (deferred): double entityName call, satisfies/as typing in ProductPanel.tsx, Enter/Space test proves only a native button; reviewer did not read the dark baseline.
Task 3: complete (commits 7b58625..9b2431e, review clean)
Merge of origin/main (140905ea, with #617): no conflict; validate --strict passes; deps rebuilt.
Task 4: dispatched (implementer: sonnet), base 140905ea
Task 4: implementer DONE_WITH_CONCERNS, commits 0b9c13d2 11dc9594 (unit red then 397 pass; test:ui product 10/10, style-guide+workbench 60 with no baseline change). Concerns: list name is "Counter, Color" (definition order) where design says "Color, Counter"; e2e tests had no red run (need 4.2); render.mjs DESCRIPTION_LINES 2 -> 3; README Components list not updated for Task 2/3 components.
Task 4: review (sonnet): spec compliant, quality Approved; Minors (deferred): DESCRIPTION_LINES 2->3 is a global renderer change (only the page SVGs changed); the panel does not stretch to the height of main.
Task 4: complete (commits 140905e..11dc959, review clean)
Merge of origin/main (with #611, #688, #690): no conflict.
Task 5: dispatched (implementer: sonnet), base ed7a0342
Task 5: implementer DONE_WITH_CONCERNS, commit 59fcd05e (steps 0-7 and 12 give the results; 5.3 passes). Concerns (guide text): names are "Counter, Color" (design says "Color, Counter"); step 12 pkill pattern also kills the driver (use [s]tart.ts); seq restarts at #1 in a run in parts; an extra state: line after each applied line.
Task 5: review (sonnet): spec compliant, quality Approved; the four differences are stale design text or a run in parts, not script defects; Minors (deferred): waitForSaved timeout message; "code null" after a signal.
Task 5: complete (commits ed7a034..59fcd05, review clean)
Ruling: the final-review fix wave corrects the design text of the test guide ("Counter, Color" order; step 12 pkill pattern [s]tart.ts) — the text is wrong, the code is right — cost if wrong: one line of a guide.
Final review: dispatched (opus), with the test guide
Final review (opus): ready with fixes. I1 ProductPanel.tsx imports entityName/shortId from src/tools (catalog must not import tools); I2 architecture README line 52 says the page ignores the product store; I3 guide and design text: "Counter, Color" order, step 12 pkill pattern [s]tart.ts, extra listener lines. Test guide: all steps pass except 12 as written (passes with [s]tart.ts). Recommended: 4 components in the workbench-app README "Components". Fix wave dispatched (sonnet).
Final fix wave: implementer done, commit acc28467 (I1-I3 and the README components; workbench-app lint, typecheck, test pass, 398 tests). Concern: sample names in EntityList.test.tsx and the style guide still read "Color, Counter" (prop data; a change would alter baselines). Scoped re-review dispatched (sonnet).
Final fix wave: re-review (sonnet): I1, I2, I3 and the README item ADDRESSED. New Important: specs/wishem/workbench/product-panel/spec.md:30 and :57 and tasks.md:31 still say "Color, Counter" (the real order is "Counter, Color").
Ruling: the finisher corrects the two spec lines and the tasks.md line before the archive (no second fix wave; text only, and the archive copies the spec into main) — the lead checks the diff of those lines — cost if wrong: one wrong word in a main spec, corrected by a later change.
Finisher: dispatched (sonnet)
