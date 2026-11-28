# SDD ledger — plan: openspec/changes/663-pixi-empty-field-name/tasks.md

Spec: openspec/changes/663-pixi-empty-field-name/specs/ and design.md. The rule is the one of #657 for renderer-react.

## Pre-flight scan

| Pair or task | Produces / consumes                                                                               | Found                                                                                                                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1           | tests of propNames and of the warnings against field-names.ts, view-warnings.ts and startRenderer | agrees with itself; one task, so no pair                                                                                                                                                                                                                       |
| T1 ↔ #542    | #542 removes pixi-page/src/construct/model.ts, which the test guide edits                         | Ruling: if #542 merges before the final review of this change, the lead agent revises steps 2 to 5 of the test guide with openspec-update-change before the final review — design.md, "Order with other changes" — cost if wrong: a test guide step to rewrite |

Ruling: the change has one task, so its one review is the final review of the full branch (opus), with the test guide — autonomous-flow.md, "Reviews" — cost if wrong: none.

## Tasks

Task 1: dispatched (implementer: sonnet), base 8f3faabb
Task 1: implementer DONE_WITH_CONCERNS, commit 37c66640 (94/94; red first; lint and prettier pass). Concern: tsc fails in src/renderer.test.ts:48 and :444 (display.tint = props.color; FieldValue includes boolean). The lead confirmed the same 2 errors on main: a latent fault from #535 (FieldValue widened); CI runs typecheck only for affected packages, so main never showed it.
Ruling: fix the two test lines in this change — the check of the pull request fails without it, and #535 made the same ruling for pixi-page — cost if wrong: two lines of a test.
Fix: dispatched (fresh sonnet implementer), FIX_BASE 37c66640
Fix: done, commit e4121dc1 (colorOf helper in renderer.test.ts; lint, typecheck, test of renderer-pixi pass, 94 tests).
Task 1: complete (commits 8f3faab..e4121dc)
Final review: dispatched (opus), with the test guide
Final review (opus): ready to merge; no Critical or Important; test guide steps 0-5 pass. Minor (deferred): steps 2 and 3 say the canvas is blue first; the clock starts with the server, so the first color can differ. Final review clean.
Finisher: dispatched (sonnet)
