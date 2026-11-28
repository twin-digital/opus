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
