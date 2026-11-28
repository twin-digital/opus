# SDD ledger — plan: openspec/changes/609-count-type-number/tasks.md

Plan commit 2af1251e (planner on opus, with openspec-propose). One task. The planner found no question for the owner. Decisions of the planner are in design.md (Decisions 1 to 6).

## Order with other changes

- #538 (not merged) also changes `sample-product` and has tests with a text count. The second to merge does the steps of "Order with other changes" of design.md.

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

Task 1: implementer DONE, commit 7024d77e (sample-product 25 tests; 17 of 25 failed before the code; lint, typecheck pass). Out of scope: lint:deps warns that nodejs/wishem/docs and nodejs/football/design have no package.json. The task review is the final review (opus), range 5ea9a442..7024d77e.
Final review (opus): with fixes; spec compliant. Test guide steps 1 to 6 and 8 to 10 PASS with real processes; step 7 PARTIAL (the process prints `wishem: problem in state.json`, the guide expects `problem in <P>/state.json`; host-nodejs cli.test.ts:294 expects the short form, so the guide is wrong). Other readers of the count: none breaks on main; #538 uses a text count, as "Order with other changes" lists. Architecture: no change needed. Important I1: design.md:669, the expected text of step 7. Minor: the ledger said Decisions 1 to 7 (corrected to 6); the committed ledger stopped at "dispatched"; the cast of the fixture stringCounter (accepted).
Ruling: the fix wave takes I1 with openspec-update-change — cost if wrong: one line.
Final review: fix wave dispatched (one implementer, sonnet), base 7024d77e.
Final review: fix wave implemented, commit 27213b05 (step 7 expects the real text; validate passes). Concern: cli.test.ts:352 expects a full path for an invalid-JSON error, which step 7 does not use. Re-review dispatched (sonnet), range 7024d77e..27213b05.
Final review: re-review (sonnet): all findings addressed, no new breakage.
Ruling: merge order 538, then 609 — 538 is in its merge of main now; 609 then merges main and does the steps of "Order with other changes" (construct-manager tests with a number count, the changeset of construct-manager) — cost if wrong: a later merge of 609.

#538 merged (d8233331). Merge of main and the steps of "Order with other changes" dispatched (one implementer, sonnet), base 27213b05.
Merge of main: commit 80c661d2 (no conflict); fix commit 1403b1fe (the tests of construct-manager and the countOf of workbench-app/src/start.test.ts use a number count; construct-manager failed 9 before the fix; sample-product 26, construct-manager 77, workbench-app 302 pass; the changeset adds construct-manager and workbench-app as patch; design, proposal, tasks changed with openspec-update-change). The lead agent read the fix diff: mechanical. Archive: specs synced and checked.
