# SDD ledger — plan: openspec/changes/611-refuse-binary-message/tasks.md

Spec: openspec/changes/611-refuse-binary-message/specs/ and design.md (D1–D4, "Interfaces", "The test guide").

## Pre-flight scan

| Pair or task | Produces / consumes                                                                                                                                                      | Found                                                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1 → T2      | T1 changes `Channel.onMessage` (optional `onBinary`) and `serveLink` sends `refused`/`malformed` with one exact text; T2 checks the same text through a real `ws` socket | consistent: the text is the same in both tasks                                                                                                                                         |
| T1           | tests 1.1/1.2 against the code of 1.3; LINK.md 1.4                                                                                                                       | agrees with itself                                                                                                                                                                     |
| T2           | the red run puts the two source files back to `main`                                                                                                                     | Ruling: use `origin/main` in place of `main` for the red run — the local branch `main` is not kept up to date in this checkout — cost if wrong: none, both name the code before Task 1 |

Ruling: the changeset step follows ~/.claude/rules/changesets.md — one file for the hub change (patch), and one file for host-nodejs (patch: its link server refuses a binary message through hub) — cost if wrong: one more file.

## Tasks

Task 1: dispatched (implementer: sonnet), base dbbc9f6c
Task 1: implementer DONE, commit ace6a92b (6 new tests red; hub 510/510, lint and typecheck pass)
Task 1: review (sonnet): spec compliant, quality Approved, no findings.
Task 1: complete (commits dbbc9f6..ace6a92, review clean)
Task 2: dispatched (implementer: sonnet), base ace6a92b
Task 2: implementer DONE, commit 25e82505 (red: 2 failed with Task 1 files from origin/main; green: host-nodejs 274/274, lint and typecheck pass). Note: its flock retry loop also re-ran the red run, because exit 1 is both "lock busy" and "test failed".
Task 2: review (sonnet): spec compliant, quality Approved, no findings.
Task 2: complete (commits ace6a92..25e8250, review clean)
Merge of origin/main (with #688 heavy.mjs): no conflict.
Final review: dispatched (opus), with the test guide
Final review (opus): ready to merge; no Critical or Important; test guide steps 1-7 pass (steps 4 and 5: trailing space in "received: welcome "). Minors (deferred): undefined as binary marker in the queue; next() waits to the vitest timeout on an early close. Final review clean.
