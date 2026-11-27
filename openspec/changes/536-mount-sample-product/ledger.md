# SDD ledger — plan: openspec/changes/536-mount-sample-product/tasks.md

Spec: openspec/changes/536-mount-sample-product/specs/ (workbench/mount and sample-product/model new; host-nodejs/model-folder, host-nodejs/cli, workbench/start, clock/time, architecture/diagrams changed). Plan commit 24ff9a1a (planner on opus, with openspec-propose; it did the brainstorm alone and did not invoke superpowers:brainstorming). Main with #534 is merged into the branch (d34a705e).

For the review issue of the milestone: a mount is a second store with the ID `product` in the workbench construct, with its own storage subsystem and folder; `wishem start <folder> --product <folder>`; the sample product is the package `@thrashplay/wishem-sample-product` with one entity (Color, Counter) and a count rule that wraps the store; UI option A was selected (nothing new on the page; the terminal shows the mount), options B and C are in design.md under "UI options for the owner".

## Pre-flight scan

| Row                                                  | Checked                                                                                                                          | Found                                                                                      |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Task 1 x Task 2                                      | Task 1 produces the package `sample-product` with its model folder; Task 2 changes `host-nodejs` and does not use the package    | No file in common.                                                                         |
| Task 1 x Task 3                                      | Task 3 uses the model folder of Task 1 in a test of `workbench-app` (development dependency)                                     | Agrees.                                                                                    |
| Task 2 x Task 3                                      | Task 2 produces `ConstructOptions.product`; Task 3 consumes it in `workbench-app/scripts/start.ts`                               | Names agree with the section Interfaces of design.md.                                      |
| Task 1 x break-test #587 (clock, a different branch) | Task 1 changes `clock/src/clock.ts`, `clock.test.ts`, and removes `globals.d.ts`; the break-test changes test files of the clock | The break-test of the clock waits in the queue; whichever merges second merges main first. |
| Task 2 x change #540 (the page is planned again)     | Both can change `host-nodejs/src/start-construct.ts` and `index.ts`                                                              | The lead reads the revised plan of #540 before Task 2 starts, and gives the order.         |
| Task 2 x issue #597 and the test guide               | Task 2 changes one line of `docs/milestones/a1-construct.md`                                                                     | No conflict.                                                                               |
| Task 3 x #597 and #540                               | Each changes the architecture document, `render.mjs`, and the container diagrams                                                 | In order: #597 merges first (small); Task 3 merges main before it starts.                  |
| Task 1 alone                                         | The tests read the model files as JSON modules, with a fallback in the plan                                                      | Agrees.                                                                                    |
| Task 2 alone                                         | Cases of state are named in the task                                                                                             | Agrees.                                                                                    |
| Task 3 alone                                         | Diagram work needs the diagrams skill                                                                                            | Agrees.                                                                                    |

No conflict that needs a ruling now.

## Tasks

Task 1: dispatched (implementer: sonnet), base d34a705e
Task 1: implementer DONE_WITH_CONCERNS, commit 043f795d (sample-product 26 tests, clock 59 tests). Concerns: the scenario 'A package with no Node.js types imports the clock' has no permanent test (the tests of the package import vitest, which brings the Node.js types); two tests of the clock pass before and after by design; withCountRule adds with BigInt; one line added to the README of the clock. Review dispatched (sonnet).
