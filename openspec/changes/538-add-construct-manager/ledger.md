# SDD ledger — plan: openspec/changes/538-add-construct-manager/tasks.md

Plan commit da893e65 (planner on opus, with openspec-propose). Four tasks. No task is dispatched yet. The planner found no question that meets the three conditions for the owner.

## For the review issue of the milestone A4

- A product construct is a hub in the workbench Node.js process, with `time`, the store wrapped by the product code, and a clock. It has its own link on a port that the system selects, and no storage subsystem. A child process is rejected for now (a follow-up).
- Control is state: the construct manager follows the construct list after each input, also after a rewind of the workbench. Only the construct manager can send a report.
- A change of the product model goes to each running construct: a changed field value becomes one `set-field`, and each other change becomes one `replace-model`.
- `constructs/send` passes writes, time inputs, and rewinds to a running construct. Only the construct manager can rewind a product construct.
- UI option A was selected: nothing new on the page.

## Order with other changes

- #540: Tasks 1, 3, and 4 use `serveHub` and files that #540 changes. Merge #540 first. The relation "blocked by #540" on #538 records the order.
- #535: no dependency of code. It can merge before or after this change.

## State at the end of the session of 2026-11-28

- NEXT STEP: after #540 is merged, merge main, create the issues of the section "Follow-up" of `design.md`, run the pre-flight scan of `superpowers:subagent-driven-development`, then Task 1.
