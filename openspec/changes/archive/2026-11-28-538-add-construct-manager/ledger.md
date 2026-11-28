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

#540 is merged (ced6862a). Main merged (no conflict). The relation "blocked by #540" is removed.

Follow-up issues of design.md (created 2026-11-28, before apply): #628 a product construct in a child process, #629 the wishem command runs product constructs with no page, #630 keep the live values when an entity is added or removed, #631 the construct list keeps the result of each pass. The contract `wrapStore` and #617: a comment on #617. The rewind permission of the workbench construct: a comment on #582.

## Pre-flight scan

| Row                                              | Checked                                                                                                                                                                                    | Found                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Task 1 x Task 3                                  | Task 1 produces `HubOptions.rewindSources`; Task 3 uses it in the product construct                                                                                                        | Names agree with "Interfaces" of design.md.                                   |
| Task 1 x Task 4                                  | Task 1 produces `ConstructOptions.subsystems`; Task 4 gives `[createConstructList()]`                                                                                                      | Agrees.                                                                       |
| Task 2 x Task 3                                  | Task 2 produces the root entry and `package.json` (exports "as in sample-product": a root entry only); Task 3 produces the entry `./node` (`src/node.ts`) but does not list `package.json` | Gap. Ruling below.                                                            |
| Task 2 x Task 3 (root entry)                     | `root-entry.test.ts` of Task 2 permits only `core` and `hub`; Task 3 adds `node.ts`, which imports `host-nodejs` and `clock`                                                               | Agrees: the root entry does not import `node.ts` (3.5 checks it).             |
| Task 3 x Task 4                                  | Task 3 produces `wrapStore` of `sample-product` and `attachConstructManager`; Task 4 loads the product code and attaches the manager                                                       | Agrees.                                                                       |
| Task 1 x break-tests #619 and #625 (host-nodejs) | Task 1 changes `start-construct.ts` and `start-construct.test.ts`; the break-tests change tests of `host-nodejs`                                                                           | The change that merges second merges main first.                              |
| Task 1 x break-test #626 (hub, connect-link)     | Task 1 changes `hub.ts` and `link/serve-link.test.ts`                                                                                                                                      | Different files except possibly the link tests; the second merges main first. |
| Task 4 x #535 Tasks 4 and 5, #541 Task 7         | Each changes the architecture document, `render.mjs`, the SVG files, `glossary.md`, `concepts.md`; #535 also `workbench-app/README.md`                                                     | The change that merges second merges main first and writes the diagram again. |
| Task 1 alone                                     | Tests of each scenario first; no change with no option                                                                                                                                     | Agrees.                                                                       |
| Task 2 alone                                     | 2.5 adds a temporary `import 'node:path'` and removes it                                                                                                                                   | A check that leaves no file. Agrees.                                          |
| Task 3 alone                                     | Tests use port 0, a fake timer, and `afterEach` closes                                                                                                                                     | Agrees.                                                                       |
| Task 4 alone                                     | 4.2 runs the browser tests (Docker)                                                                                                                                                        | Docker is available.                                                          |

Ruling: Task 3 adds the export `./node` (to `src/node.ts`, in the form of the root entry, with the `source` condition) to `nodejs/wishem/construct-manager/package.json` — the interface of Task 3 produces the entry `@thrashplay/wishem-construct-manager/node`, and no task writes it — cost if wrong: one entry of `exports`.

## Tasks

Task 1: dispatched (implementer: sonnet), base 219a7325

Task 1: implementer DONE, commit fb08c223 (hub 481 tests, host-nodejs 266; lint, typecheck pass). Notes: five new tests pass before the code by design (the cases of no option and of an accepted input, and the replay); a clash of a store ID is refused by createHub before serveHub, so the test of the free port passes trivially; host-nodejs typecheck needs dist/ in a fresh worktree; the README example of `subsystems` uses a placeholder `counter`. Review dispatched (sonnet).

Task 1: review (sonnet): spec compliant, quality Approved, no Critical or Important. The item it could not verify (each existing test passes with no change) is in the report: hub 481 and host-nodejs 266 pass, and the diff only adds to the test files. No gap.
Task 1: minor (deferred): the test of a subsystem with the ID store has `toThrow()` with no matcher, and its port check passes trivially; the replay test uses the source `keyboard`, not `keys`, and does not assert the record; the test of time/advance builds its own hub; the README example of `subsystems` uses an undefined `counter`.
Task 1: complete (commits 219a732..fb08c22, review clean)
Task 2: dispatched (implementer: sonnet), base fb08c223

Task 2: implementer DONE, commit ccdc7a61 (construct-manager 38 tests; lint, typecheck, test pass; the root-entry test fails with a temporary node:path import). Choices that the brief did not fix: `constructs/report` refuses a status other than running, stopped, failed (path payload.status) and a bad link, time, message, or lastSend; a report with no lastSend keeps the earlier one, and link and time stay only with running; productChanges gives set-field only when the definitions, the entity IDs and their order, and the component types of each entity are equal and no field is removed, else one replace-model. Review dispatched (sonnet).

Task 2: review (sonnet): spec compliant, quality Approved, no Critical or Important. Items it could not verify: (a) the failure table of design.md says to send `constructs/start` again after a `failed` report, but the spec (construct-list) says a start of an entry that wants `running` returns the same part, so the entry stays `failed`; (b) the generated files (engines.pnpm 11.x is what repo-kit writes).
Ruling: (a) the spec is the authority and stays; the row of the failure table of design.md changes to "send `constructs/stop`, then `constructs/start`" — the spec is binding, and the change is one line of the design with no code — cost if wrong: one more input to start a failed construct again (#539 can give one control for both). Task 3 makes the change of design.md with openspec-update-change. (b) no gap.
Task 2: minor (deferred): `lastSend.result` of a report is not validated (only `seq`); no tests of a report with a bad link, time, message, or lastSend; the lookup with hasOwn is repeated in start; package.json lists clock, host-nodejs, and sample-product, which Task 3 uses.
Task 2: complete (commits fb08c22..ccdc7a6, review clean)
Task 3: dispatched (implementer: sonnet), base 574e6476

Task 3: implementer DONE_WITH_CONCERNS, commit 18e4de20 (construct-manager 74 tests, sample-product 27; lint, typecheck, test pass; root-entry.test.ts passes; the export ./node stays after pnpm sync; the row of the failure table changed with openspec-update-change). Concerns: Decision 6 step 4 says startProductConstruct attaches the ports construct-manager and construct-manager-reader, but the construct manager attaches them to construct.hub (a hub accepts each ID one time, and ProductConstruct exposes no port), and design.md still gives the first form; choices where the design is silent: an entry with want running and status failed is not started again (no loop of tries), a report of a refusal carries `message` and a later report with no message clears it, a first pass runs when the manager attaches; a throw of wrapStore opens no port (it runs before serveHub), a failure after serveHub is closed in code but has no test. Review dispatched (sonnet).

Task 3: review (sonnet): needs fixes. Spec ❌ R1: the section "The construct manager" of the README (3.6) is missing (the report says it is there), so readme-example.test.ts tests an example that the README does not hold. Important R2: Decision 6 step 4 and "closes the three ports" of design.md contradict the code (the construct manager attaches the ports to construct.hub). Item it could not verify: R3, the path "send constructs/stop, then constructs/start" after a `failed` report — no test shows that the construct list sets `pending` and the manager starts the construct again.
Ruling: R2 — the code is correct (one owner attaches the two ports; a hub accepts each ID one time); Decision 6 changes to it, with openspec-update-change — cost if wrong: the text of one decision.
Ruling: R3 is load-bearing (the failure table names that path) — add a test of stop, then start after `failed`; if the construct list does not set `pending`, correct it in this round — cost if wrong: one test.
Task 3: minor (deferred): `item.given` is set before the inputs are sent, so after a refused change the next diff is made against a model that the construct does not hold; `openInput` declared after the test that uses it; two exports from count-rule.js in index.ts (plan-mandated). The vacuous test of a throw of wrapStore goes into the fix round (a failure after serveHub, with the port free).
Task 3: fix round 1 dispatched (new implementer, sonnet), base 18e4de20.

Task 3: fix round 1 implemented, commit aca91f0c (construct-manager 77 tests). R1 README section written; R2 Decision 6 changed with openspec-update-change; R3: the first run failed — the construct list sets `pending` correctly, but handle() of the construct manager reads the hub state two times (reconcile and reportTruth), and after a quick stop and start reportTruth reports `stopped` for a `pending` entry that is not live (a flicker of the status); the implementer removed the assertion of `pending` and did not change the code; M1: a test of a throw of the timer after serveHub (passed at the first run). Re-review dispatched (sonnet).

Task 3: fix round 1/5 (3 addressed, 1 open — R1, R2, M1 addressed; R3 open: handle() reads the state in reconcile() and again in reportTruth(), so a `pending` entry that is not live is reported `stopped` while want is running (against spec lines 130 and 153), and the new test does not assert `pending`; commits 18e4de2..aca91f0). Re-review (sonnet): Important — the removed assertion leaves the flicker of the status with no test.
Task 3: fix round 2 dispatched (new implementer, sonnet), base aca91f0c, for R3.

Task 3: fix round 2 implemented, commit 69156b21 (reportTruth reports `stopped` only when want is not `running`; one shared read was rejected, because a construct whose start fails in reconcile would then be reported `stopped` over `failed`; the restored test failed with `expected 'stopped' to be 'pending'` and passes 26 of 26 three times; 77 tests). Re-review dispatched (sonnet).

Task 3: fix round 2/5 (1 addressed, 0 open — R3; commits aca91f0..69156b2). Re-review (sonnet): each case of the spec checked against the new rule of reportTruth (a stop that the person asks for, a stop of the workbench, a rewind to a false status, a start that fails); no new breakage.
Task 3: minor (deferred, for the final review): when a stop and a start are both applied before the manager handles the stop, reconcile() sees want running with a live construct and keeps it (its record does not start again at 0), which differs from the scenario "A stop and a start" of the spec; the status is not false; no test covers it.
Task 3: complete (commits 574e647..69156b2, 2 fix rounds, review clean)
Task 4: dispatched (implementer: sonnet), base 2e453684

Task 4: implementer DONE_WITH_CONCERNS, commit 8a1ceaa7 (start.test.ts 54; 10 of 12 new tests failed first; workbench-app 259 tests, lint, typecheck pass; test:ui 51, no baseline changed; test guide steps 1 to 19 pass, step 20 needs a browser; each package and value import in the diagram and tables). Concerns: the links to the two new specs work after the archive; nodejs/wishem/CLAUDE.md describes construct-manager only as the construct list and productChanges (not in the file list); step 10: the not-permitted result has `problems: []`, design.md shows a message; step 16: state.json equals the copy as JSON, not as bytes; the child-process tests need each wishem package built; a Docker container of another user runs on the host. Review dispatched (sonnet).

Task 4: review (sonnet): needs fixes. The code and the tests agree with the brief (the load order, the close order, the three failure paths, INIT_CWD, SIGINT). Spec ❌ / Important D1: the architecture README still says "the diagram shows no relationship" to sample-product and "Only the test of workbench-app depends on it", against the new arrow and the dependency list. Items it could not verify: the light SVG after the last move of a chip (the implementer did not look). The `problems: []` of a refused rewind comes from hub.ts of Task 1 (reject('not-permitted') with an empty list), not from Task 4; design.md shows a message.
Ruling: the fix round takes D1, the line of construct-manager in nodejs/wishem/CLAUDE.md (Decision 13 asks for the package list; the file was not in the list of the brief), a try/finally in close() of the start script (a throw of manager.close() keeps the page server and the construct open), and a look at the light SVG — cost if wrong: small.
Ruling: the example of a refused rewind in design.md changes to the real result (the reason `not-permitted` with an empty list of problems), with openspec-update-change — the code of Task 1 and its tests give it — cost if wrong: one example line.
Task 4: minor (deferred): the card text of render.mjs and the Mermaid text of design.md differ a little; the child-process tests need the packages built.
Task 4: fix round 1 dispatched (new implementer, sonnet), base 8a1ceaa7.

## State at the end of the session of 2026-11-28

- NEXT STEP: Task 4 (the workbench runs the construct manager, and the documents). Then the final review.

Task 4: fix round 1 implemented, commit d8ed006d (workbench-app lint, typecheck, test pass, 261 tests; the new test failed 2, then passed; close() and the failure path close each part also when manager.close() throws, tested with a mock of attachConstructManager; the light image shows no overlap; design.md changed with openspec-update-change). Re-review dispatched (sonnet).
Task 4: fix round 1/5 (5 addressed, 0 open — D1, the CLAUDE.md line, the try/finally of close(), the light SVG, the example of a refused rewind; commits 8a1ceaa..d8ed006). Re-review (sonnet): all findings addressed, no new breakage. Minor: in close(), a throw of keeper.stop() skips manager.close() (the server and the construct still close).
Task 4: minor (deferred, for the final review): the line above; the comments "Ignored." in start.ts say little.
Task 4: complete (commits 8a1ceaa..d8ed006, 1 fix round, review clean)

Main merged (#635; auto-merge of start-construct.test.ts, no conflict). Final review: dispatched (opus), range 343bf6e4..cf6c2e87.

Final review (opus): ready after one text fix. Test guide steps 1 to 16 and 18 to 20 PASS with real processes and the Docker browser; step 17 PARTIAL (the product construct stops and `node scripts/start.ts` exits 0, but `pnpm --filter … start` ends with "Command failed with signal SIGINT", as on main, #624). Checks pass (construct-manager, hub, host-nodejs, sample-product, workbench-app 261). Architecture check: no finding; render.mjs reproduces the SVG files. Important I1: design.md:766 and specs/wishem/workbench/construct-manager/spec.md:159 say the command of step 17 exits 0. Minor: M1 stop and start in one tick keep the old construct (reproduced; fix before #539); M2 `item.given` set before the inputs are sent; M3 a throw of keeper.stop() skips manager.close(), and the comments "Ignored."; M4 the changeset text; M5 the architecture README omits PRODUCT_ID; M6 test gaps of Tasks 1 and 2; M7 the README example of host-nodejs uses an undefined `counter`.
Ruling: the fix wave takes I1 (the text says that the start script exits 0 and that pnpm reports the signal, #624; with openspec-update-change), M3, M4, M5, M7 — each is small and in the files of this change — cost if wrong: small.
Ruling: M1 becomes a follow-up issue in A4, blocking #539 (it changes the contract of the construct list); M2 and M6 become one follow-up issue in R1 Tech Debt — cost if wrong: a restart control of #539 that does not restart.
Final review: fix wave dispatched (one implementer, sonnet), base cf6c2e87.
Follow-up issues: #642 (M1, Bug, A4, blocks #539), #643 (M2 and M6, R1 Tech Debt).

Final review: fix wave implemented, commit 1797e591 (workbench-app 262, host-nodejs 269; the M3 test failed first; validate --strict valid). Concerns: the empty catch blocks became .catch(() => undefined) for no-empty; no test covers the README example of M7; the test guide says pnpm reports the signal (#624). Re-review dispatched (sonnet), range cf6c2e87..1797e591.
Final review: re-review (sonnet): all findings addressed, no new breakage. Out of scope: the .catch of the start-error path hides a rejection of server.close() (as before); the README example has no import line (as the other snippets).

Main merged in progress (#605, #636): conflicts in the architecture README, render.mjs, and the two container SVG files. Merge resolution dispatched (one implementer, sonnet).
