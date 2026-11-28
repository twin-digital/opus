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

## State at the end of the session of 2026-11-28

- NEXT STEP: Task 2, then Tasks 3 and 4. Carry to Task 3 the ruling on the export `./node`.
