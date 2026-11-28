# SDD ledger — plan: openspec/changes/609-count-type-number/tasks.md

Plan commit 2af1251e (planner on opus, with openspec-propose). One task. The planner found no question for the owner. Decisions of the planner are in design.md (Decisions 1 to 7).

## Order with other changes

- #538 merged to `main` first (d8233331). This change is second. After the merge of `main`, the tests of `construct-manager` use a number count, and `construct-manager` is in the changeset and in "Package Impact".

## Pre-flight scan

| Row                 | Checked                                                                         | Found                                            |
| ------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------ |
| Task 1 alone        | Tests first (1.1), then the code (1.2), README (1.3), changeset and lint (1.4)  | Agrees.                                          |
| Task 1 x #538       | #538 changes `sample-product/src/index.ts`, README, and tests with a text count | The second to merge does the steps of design.md. |
| Task 1 x #637, #638 | Break-tests of `core` and `renderer-react`                                      | Different packages. No conflict.                 |

Ruling: no break-test issue for `sample-product` — on `main` only the tests of `workbench-app` use it (a development dependency); the rule of autonomous-flow.md names `core`, `hub`, `clock`, and `host-nodejs` — cost if wrong: one break-test issue later.
Ruling: the change has one task, so its one review is the final review of the full branch (opus), with the test guide — autonomous-flow.md, "Reviews" — cost if wrong: none.

## Tasks

Task 1: dispatched (implementer: sonnet), base 2af1251e
