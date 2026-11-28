# SDD ledger — plan: openspec/changes/639-link-result-and-seq-rules/tasks.md

Plan commit aa038085 (planner on opus, with openspec-propose). Two tasks. No question for the owner. Decisions in design.md (D1 to D6): a `result` with both keys is malformed (a key with null counts as present); a `result` is also malformed when `request` is not an integer, `result` is not an object with a boolean `ok`, or `error` is not text; four numbers must be integers from 0 to 2^53 − 1 and the client closes at that message; the status of a `welcome` is `created` or `running` only; a malformed `welcome` is a failed attempt with the usual wait; the rules are wider than the three findings, because the clients also differ on those points.

## Order with other changes

- #611 (the hub side refuses a binary message) also changes LINK.md and the hub side of the link. It starts after this change merges.
- #542 (being planned) uses the three renderers; no shared code with this change.

## Pre-flight scan

| Row                 | Checked                                                                        | Found                           |
| ------------------- | ------------------------------------------------------------------------------ | ------------------------------- |
| Task 1 x Task 2     | Task 1 writes the rules in LINK.md; Task 2 makes the GDScript client obey them | Task 2 reads LINK.md of Task 1. |
| Task 1 x other work | hub: no other change in work on messages.ts or open-link.ts                    | No conflict.                    |
| Task 2 x #662       | #662 (Todo) changes the Godot construct, not the client                        | No conflict.                    |

## Tasks

Task 1: dispatched (implementer: sonnet), base aa038085
