# SDD ledger — plan: openspec/changes/642-restart-on-stop-start/tasks.md

Plan commit 33ab10b2 (planner on opus, with openspec-propose). Two tasks. No question for the owner. The decisions of the planner are in design.md: the field `startSeq` (**Proposed**) holds the `seq` of the `constructs/start` that wrote the entry; `reconcile()` starts a live construct again when its `startSeq` differs; `reportTruth()` does not change (the ruling of #538 stays); a report does not carry `startSeq`.

## Order with other changes

- #617 (PR #648, in apply): its Task 4 changes construct-manager.ts and its tests. The second to merge does the steps of "Order with other changes" of design.md.

## Pre-flight scan

| Row                                          | Checked                                                                          | Found                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------- |
| Task 1 x Task 2                              | Task 2 changes raw-link.mjs for the test guide; Task 1 changes construct-manager | Independent.                           |
| Task 1 x #617 Task 4                         | Both change construct-manager.ts and its tests                                   | The second to merge merges main first. |
| Task 1 x break-test #647 (construct-manager) | #647 changes the tests of construct-manager                                      | The second to merge merges main first. |

Ruling: apply now, before #617 merges — a conflict in one file is not a reason to wait (the owner, 2026-11-28) — cost if wrong: one merge with a conflict.

## Tasks

Task 1: dispatched (implementer: sonnet), base 33ab10b2

Task 1: implementer DONE, commit b1c1387c (11 of 85 failed before the code; lint, typecheck, test pass, 85). Choices: test (a) starts the construct paused to check running false and ticks 0; a stop and a start added to the replay test of construct-list.test.ts. Review dispatched (sonnet).
Task 1: review (sonnet): spec compliant, quality Approved, no Critical or Important. The reviewer reasoned that tests (a), (b), (c) and the list tests fail before the change; (d) is a guard.
Task 1: minor (deferred): overlapping `eventually` calls in test (a); startSeqOf returns -1 for no start; a duplicate fact in two list tests; no test of a report that keeps startSeq after a restart.
Task 1: complete (commits 33ab10b..b1c1387, review clean)
Task 2: dispatched (implementer: sonnet), base b1c1387c

Task 2: implementer DONE, commit 96736039 (raw-link.mjs is a docs script outside a package: no lint, typecheck, test; the run of steps 2, 5, 6 of the test guide passed with real processes; before the change two --send sent only the last). Review dispatched (sonnet).
Task 2: review (sonnet): spec compliant, quality Approved. Minor (deferred): with several --send, a bad JSON value throws after the earlier inputs are sent.
Task 2: complete (commits b1c1387..9673603, review clean)
Main merged (c7372b1a, no conflict). Final review: dispatched (opus), range 58e01897..c7372b1a.

Final review (opus): with fixes, no Critical or Important. Test guide steps 1 to 11 PASS with real processes (step 5 the one-pass case: stopped, then runs at a new port; step 11: node scripts/start.ts exits 0, pnpm reports the signal). construct-manager 85, workbench-app 302 pass. Architecture: no change. Minor: M1 the docs say startSeq is "the last start", but the entry keeps the start that wrote it (README.md:56, construct-list.ts:299, glossary.md:139; tasks.md 1.5 prescribed the wording); M2 the README section "The construct manager" does not say that a stop and a start always give a new construct; M3 tasks.md unchecked (archive step); M4 the committed ledger is stale (archive step); M5 a double wait in test (a).
Ruling: the fix wave takes M1 and M2 (the docs must state the contract correctly); M3 and M4 are steps of the archive; M5 stays deferred — cost if wrong: small.
Final review: fix wave dispatched (one implementer, sonnet), base c7372b1a.
Final review: fix wave implemented, commit 494b00a8 (M1 and M2; validate passes; construct-manager 85 pass). Re-review by the lead agent (docs only, 6 files, 9 lines): both addressed, no new problem.
Ruling: 642 merges before 617 — 642 is complete and 617 has three tasks left; the second to merge does the steps of "Order with other changes" — cost if wrong: the merge work moves to 617, which knows the steps.
