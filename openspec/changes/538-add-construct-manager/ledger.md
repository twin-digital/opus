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

## State at the end of the session of 2026-11-28

- NEXT STEP: Task 1, then Tasks 2 to 4.
