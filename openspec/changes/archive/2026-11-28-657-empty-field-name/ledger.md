# SDD ledger — plan: openspec/changes/657-empty-field-name/tasks.md

Plan commit 2734a8a3 (planner on opus, with openspec-propose). One task. No question for the owner. Decisions in design.md: a field whose label gives an empty name gives no prop and one warning (`empty-name`, **Proposed**), as a reserved name; two empty names give one warning each; the generator does not change; a name that starts with a digit keeps its prop; the Godot and PixiJS renderers do not change (parity: #542).

## Pre-flight scan

| Row                 | Checked                                                                      | Found        |
| ------------------- | ---------------------------------------------------------------------------- | ------------ |
| Task 1 alone        | Tests first, then propNames, ViewWarning, describeWarning, README, changeset | Agrees.      |
| Task 1 x other work | renderer-react: no other change in work (break-test #638 merged)             | No conflict. |

Ruling: the change has one task, so its one review is the final review of the full branch (opus), with the test guide — autonomous-flow.md, "Reviews" — cost if wrong: none.

## Tasks

Task 1: dispatched (implementer: sonnet), base 2734a8a3

Task 1: implementer DONE, commit 2ccae00f (7 failed before the code; lint, typecheck, test pass, 203). The task review is the final review (opus).
Final review (opus): with fixes; spec compliant. Test guide steps 0 to 4 PASS (the real workbench and the Docker browser; the model copy in .superpowers/). renderer-react lint, typecheck, test pass (164). Important I1: nodejs/wishem/docs/architecture/README.md:145 says the console warning names one of four problems; this change adds `empty-name`. Minor: Renderer.test.tsx:870 has no `title` field as the scenario; no test of a reference field with an empty name (hold.ts:36); the doc comment at field-names.ts:23 is long. Observations: #663 (PixiJS), #542 (Godot), #664 (workbench-app README).
Ruling: the fix wave takes I1 — cost if wrong: one line.
Final review: fix wave dispatched (one implementer, sonnet), base 2ccae00f.
Final review: fix wave implemented, commit 5acde4ae (README.md:145 names five problems with empty-name). Re-review by the lead agent (one line): addressed.
