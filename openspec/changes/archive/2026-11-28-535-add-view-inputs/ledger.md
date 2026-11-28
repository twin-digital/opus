# SDD ledger — plan: openspec/changes/535-add-view-inputs/tasks.md

Plan commit 6af27ec7 (planner on opus, with openspec-propose; it did the brainstorm alone and did not invoke superpowers:brainstorming). Five tasks. No task is dispatched yet.

Main merged into the branch (no conflict; install, sync, update-readme gave no change), before Task 1.

Follow-up issues of design.md (created 2026-11-27, before apply): #606 list of references (A4), #607 `store/clear-field` (A4), #608 a view gets the ID of a referenced entity (A3), #609 sample product `count` as `number` (A4, blocked by #535). The two items with issues already got a comment: #557 (one root for the paths of problems) and #582 (permission of `hub/rewind`, undo).

## Pre-flight scan

| Row | Checked | Found |
| --- | --- | --- |
| Task 1 x Task 2 | Task 1 produces `FieldType`, `FieldValue` (`string \| number \| boolean`), `FIELD_TYPES`, `SetFieldPayload`; Task 2 consumes them in `renderer-react` | Names agree with "Interfaces" of design.md. `collect-views.ts` uses `FieldValue` in `ViewProps`; a wider type can give a type error in `renderer-react` at the end of Task 1. 1.6 says: report it, Task 2 changes that package. Ruling below. |
| Task 1 x Task 3 | Task 3 consumes the type `reference` of Task 1 (`hold.ts`, the generator) | Agrees. |
| Task 1 x Task 4 | Both change `docs/architecture/README.md` and `render.mjs` (1.5 the entity diagram, 4.3 the component diagram of the page) | Different diagrams and sections; in order on one branch. No conflict. |
| Task 1 x Task 3 (`concepts.md`) | 1.4 changes "Relations between entities" and one line of "References"; 3.5 changes "Views" | Different sections. No conflict. |
| Task 2 x Task 3 | Both change `Renderer.tsx`, `view-warnings.ts`, `view-types.ts`, `collect-views.ts`, `index.ts`, README of `renderer-react`; Task 3 consumes `ViewTools` and the prop `wishem` | In order. Task 2 gives a reference field no special treatment; Task 3 adds it. No conflict. |
| Task 2 x Task 5 | 2.5 writes `AppBar.view.gen.ts` again and does not change `views/AppBar.tsx`; Task 5 changes `views/AppBar.tsx` with `wishem.setField` | In order. No conflict. |
| Task 2 x Task 4 | Task 4 consumes `InputPort` and `RendererProps.input` | Names agree with "Interfaces". |
| Task 4 x Task 5 | Task 5 consumes the input port of the page; both change `workbench-app/README.md` | In order. No conflict. |
| Task 4 x change #540 (Task 4 of #540 in work) | #540 moves the reconnect of the link into `hub` as `connectLink` and makes `connectHub` a function on it; 535 Task 4 changes `connectHub` to one ID for the life of the client and two subsystems | Task 4 of 535 has the branch for both orders (Decision 15). The lead reads the state of #540 before Task 4 starts and gives the order in the dispatch. |
| Task 1 x change #536 | Both change the architecture document, `render.mjs`, the entity diagram SVGs, `glossary.md`, `concepts.md`, and the requirement "The entity diagram of the model folder" | The change that merges second merges main first, and the second archive merges the requirement (workflow follow-up). |
| Task 1 alone | Tests of each scenario before the code; 1.3 keeps `===` | Agrees. |
| Task 2 alone | 2.4 adds a file with `// @ts-expect-error` lines that the type check reads | A test by type check, not a test that asserts nothing. Agrees. |
| Task 3 alone | Tests of state against `hold.ts` and `Renderer.tsx` | Agrees. |
| Task 4 alone | The conditional on #540 adds `connect-link.ts` of `hub` to its files | Agrees. |
| Task 5 alone | Needs Docker for `test:ui:update` and `test:ui` | Docker is available. |

Ruling: if the type check of `renderer-react` fails at the end of Task 1 only because `FieldValue` is wider, Task 1 is complete with that failure recorded, and the Task 2 dispatch carries it — the plan gives `renderer-react` to Task 2 and 1.6 says to report it; the branch is not pushed for merge between tasks — cost if wrong: one red check of the draft pull request until Task 2.

## Tasks

Task 1: dispatched (implementer: sonnet), base 7e8615fd

Task 1: implementer DONE_WITH_CONCERNS, commit 7c38349e (core 183 tests; lint, typecheck, test, build pass; renderer-react typecheck and test pass, 109; host-nodejs typecheck passes, 2 of 187 tests fail). Concerns: two tests of host-nodejs/src/read-model-folder.test.ts (lines 97 and 147) use `definition('number')` as a field type that is not known, and `number` is now valid; the new store tests passed on their first run (the validation was done before the store); the legend says "One" in place of "Exactly one" so that "Zero or one" fits.
Ruling: correct the two fixtures of host-nodejs in Task 1, with a type that stays unknown (for example `date`) — 1.6 requires the tests of host-nodejs to pass, the tests check a problem of an unknown type and not `number`, and the plan did not see that the fixture used `number` — cost if wrong: one test file outside the file list of the task. Fixed before the review (a correctness concern). Fix dispatched (new implementer, sonnet), base 7c38349e.

Task 1: correction of the fixtures, commit 93962ba8 (`number` to `date` in two fixtures; the two tests failed before and pass after; host-nodejs lint, typecheck, test pass, 187). Review dispatched (sonnet), range 7e8615fd..93962ba8.

Task 1: review (sonnet): spec compliant, quality Approved, no Critical or Important. Items it could not verify, checked by the lead: Decision 8 of design.md agrees with the code that the review read (finite number, true or false, the form e_<uuid> and a second pass, `===` kept); the implementer viewed the PNG of each SVG; the report shows the runs of 1.6. No gap. The ruling of the pre-flight on renderer-react is not needed: its type check passed.
Task 1: minor (deferred): the legend says "One" in place of "Exactly one" (a widening of the legend keeps the exact term); one dense `if` block in validate-model.ts (type check, form check, assignment, push); `F` in store.hub.test.ts is typed as a plain string; no RED run of the store tests (store.ts needed no change).
Task 1: complete (commits 7e8615f..93962ba, review clean)

Task 2: dispatched (implementer: sonnet), base f6f391a5

Task 2: implementer DONE_WITH_CONCERNS, commit f9312092 (renderer-react 151 tests; lint, typecheck, test, build pass; workbench-app 240 tests, the generated files are current). Concerns: workbench-app/src/views/AppBar.test.tsx changed (outside the file list) because Props now needs `wishem`; generated-types.test.ts uses a copy of the generated form by hand; RESERVED_PROP_NAMES is in field-names.ts (that file imports nothing relative) and view-tools.ts exports it again; Renderer builds the props with a cast; the README no longer says that the package uses hub for types only (LinkClosedError is a run-time import); two temporary files in /tmp and nodejs/wishem, removed.
Ruling: accept the change of AppBar.test.tsx in Task 2 — 2.7 requires the type check of workbench-app to pass, and the test must give the new required prop; Task 5 changes the same file later — cost if wrong: one test file outside the list. Review dispatched (sonnet).

Task 2: review (sonnet): spec compliant, quality Approved, no Critical or Important. Items it could not verify, checked by the lead: the report shows the runs of 2.7 and the test "the generated files are current"; the type check of renderer-react reads each .ts file (tsconfig.json has no include), so generated-types.test.ts is checked. No gap.
Task 2: minor (deferred): generated-types.test.ts is a copy of the generated form by hand (a test that compares it with renderViewTypes would stop a drift); ViewProps intersects an index signature with `wishem`, which forces the cast in Renderer.tsx (Task 3 widens the type: fix there); `fields?: [Id, Id] | [Id]` in view-warnings.ts with `?? ''` fallbacks; the README says a reference field has the type string "in this version" (Task 3 updates it); the "never settles" test of stubViewTools waits one microtask only; the test "sends no input when the renderer draws two times" has low value.
Task 2: complete (commits f6f391a..f931209, review clean)

Task 3: dispatched (implementer: sonnet), base 2785da9d

Task 3: implementer DONE_WITH_CONCERNS, commit 20c7f076 (renderer-react 182 tests; lint, typecheck, test, build pass). ViewProps is now `Readonly<Record<string, FieldValue | ReactNode>> & { wishem }`, and the cast of Renderer.tsx is gone. Concerns: the wider ViewProps broke 9 lint sites in tests (a helper `text()` in Renderer.test.tsx); a reference field whose label gives no prop holds nothing; findHolds runs two times for each model change; concepts.md still has the section "References (**Open**)" and a general sentence (only the named sentence changed); workbench-app not checked for ViewProps. The concerns are observations, so review dispatched (sonnet).

Task 3: review (sonnet): spec compliant, quality Approved, no Critical or Important. Items it could not verify, checked by the lead: the scenario "A cycle with no entity at the top level" of renderer-html/renderer (draws neither, one warning) agrees with the test (innerHTML is ''); the report shows the run of 3.6. ViewProps has no use outside renderer-react (the review checked). No gap.
Task 3: minor (deferred): in a diamond with a cycle, the warning names the back edge of the search, which can differ from the edge that the draw cuts; a local `text` in the cycle test shadows the helper `text()`; the helper `text()` hides a ReactNode with ''; findHolds runs two times for each model change; `FieldValue | ReactNode` is redundant; concepts.md still has the section "References (**Open**)" and a general sentence near line 79 (for the final review); no type-level test of the generated ReactNode member.
Task 3: complete (commits 2785da9..20c7f07, review clean)
Ruling: Task 4 waits for the merge of #540, and then does the path of Decision 15 (connectLink in hub keeps one ID for the life of a client) — #540 is at its last task, and Task 4 done now on hub-client.ts must be done again after #540 merges — cost if wrong: the 535 apply waits about one hour. The order is a "blocked by" relation from #535 to #540, removed when #540 merges.

#540 is merged (ced6862a); the relation "blocked by #540" is removed. Main merged (1973b30d, subagent: conflicts in field-names.test.ts and view-types.test.ts with the tests of break-test #596; two tests of main changed to the new form of the generated file; renderer-react 198 tests, core, workbench-app pass; generate gives no change).
Task 4: the path of Decision 15 (connectLink of hub keeps one ID for the life of a client). The test of #540 "each ID is new for each link" changes on purpose. Task 4: dispatched (implementer: sonnet), base 1973b30d.

Task 4: implementer DONE_WITH_CONCERNS, commit 274e51b7 (hub, workbench-app: lint, typecheck, test pass; pixi-page typecheck and test pass, lint fails). Concerns: pixi-page lint fails with no-unnecessary-type-assertion at src/views/ClearColor.test.ts:49 (`5 as unknown as string`), because FieldValue of Task 1 accepts a number; an optional `suffix` of LinkClientSubsystem so that each subsystem of one client shares one hex (`page-<hex>` and `page-<hex>-input`); the test of the suffix and the shared hex was not seen to fail first; Page.test.tsx uses a stand-in view (AppBar does not call wishem until Task 5); main.test.tsx does not check that the page gets the new input port; `eslint --fix` once outside the lock.
Ruling: the lint failure of pixi-page is a fault of this branch (the wider FieldValue makes the cast unnecessary) and a check of the pull request fails, so it is corrected in Task 4: remove the cast and keep the meaning of the test — cost if wrong: one test line of a different package. The test of the suffix is shown to fail with the code reverted for a moment. Fixed before the review.
Task 4: fix dispatched (new implementer, sonnet), base 274e51b7.

Task 4: correction, commit 18b542a6 (the cast of ClearColor.test.ts removed; pixi-page lint, typecheck, test pass, 89; the test of the suffix failed with the code reverted, 1 of 32, and passes after the restore). Review dispatched (sonnet), range 1973b30d..18b542a6.

Task 4: review (sonnet): quality Approved, no Critical or Important; spec ❌ — S1: step 4.2 asks main.test.tsx to show that a second `welcome` gives the ports of the new link to the page, but the test compares only the IDs of the two `hello` messages, and `input={input}` of main.tsx has no test. Items it could not verify: the test of the real app bar with an input (Task 5 adds it); the changeset of workbench-app (the finish adds it, as the workflow follow-up says).
Task 4: minor (deferred): the test title "inside onPortss"; no blank line between two tests in Page.test.tsx; the README bullet of connectLink says "for each link" (say "for the life of the client"); the label "Send inputs [wishem]" overlaps "Mounts with props" by 2 px in the component diagram; the option `suffix` goes a little beyond Decision 15 (accepted by the review).
Task 4: fix round 1 dispatched (new implementer, sonnet), base 18b542a6, for S1.

Task 4: fix round 1/5 (1 addressed, 0 open — S1; commits 18b542a..ad53b89; the test "gives the input port of the new link to the views" fails with input={undefined} and passes; workbench-app 255 tests). Re-review (sonnet): no new breakage.
Task 4: complete (commits 1973b30..ad53b89, review clean)
Task 5: dispatched (implementer: sonnet), base 4412cb79

Task 5: implementer DONE, commit 93338fe9 (workbench-app 283 unit tests; lint, typecheck pass; no-raw-colors green; test:ui 60 of 60; only components-light.png and components-dark.png changed, and the implementer looked at both). Notes: Vite ws-proxy ECONNRESET lines in the log of the web server of test:ui (also before this task); the test "an edit to the view of the app bar" replaces a different JSX line; the check of an empty title uses trim(), but the text that is sent is not trimmed. Review dispatched (sonnet).

Task 5: review (sonnet): spec compliant; needs fixes. Important A1: AppBar.tsx `void onRename(draft).then(...)` has no path for a rejection; a rejected or thrown onRename keeps the phase `saving` (the field is read-only for ever) and the rejection is unhandled. Items it could not verify, checked by the lead: components-dark.png (the lead looked: the three specimens agree with "UI" on the dark ground); the test:ui runs are in the report; the regex `page-<16 hex>-input` depends on the form of Task 4 (correct now).
Ruling: the minor A2 (the check of an empty title uses trim(), but the compare and the sent text are not trimmed) goes into the fix round: the title that is sent is trimmed, and the compare uses the trimmed text — cost if wrong: spaces at the ends of a title are removed.
Task 5: minor (deferred): a commit by blur that is accepted moves the focus back to the title button (the spec says so); a redundant `lowercase` class on the button; the unmount test cannot fail (React 18 emits no error for a setState after unmount).
Task 5: fix round 1 dispatched (new implementer, sonnet), base 93338fe9.

Task 5: fix round 1/5 (2 addressed, 0 open — A1, A2; commits 93338fe..b65c7b3; 287 tests; test:ui 60, no baseline changed). Re-review (sonnet): no new breakage.
Task 5: minor (deferred): the catch of AppBar.tsx drops the thrown error with no log.
Task 5: complete (commits 4412cb7..b65c7b3, review clean)

Main merged (#633, #634; no conflict). Final review: dispatched (opus), range fcf369e4..00162c56.

Final review (opus): with fixes. Each step of the test guide (0 to 11) PASS with real processes and the Docker browser (step 9 passes in substance; its expected path form is wrong). 18 checks pass: core 183, hub 477, renderer-react 198, workbench-app 287 and test:ui 60 (no baseline change), host-nodejs 264, pixi-page 89. Important: I1 renderer-react imports LinkClosedError of hub as a value, and the container diagram has no relationship (README lines 42 and 85 say types only); I2 AppBar.tsx (the catalog) imports outcomeText from ../views/, against Decision 12, a relationship Catalog to Views that the component diagram does not show (added by the fix round A1); I3 the main specs hub/link (lines 193, 198) and renderer-pixi/page (line 11) say each link uses new IDs, against Decision 15, and the change has no delta for them. Minor: M1 workbench-app/README.md:74 (Values and wishem) and docs/architecture/README.md:110 (the kinds of warning); M2 concepts.md:452 "a view changes no state"; M3 hub/README.md:134 "for each link"; M4 design.md "Package Impact" and proposal.md say hub does not change; M5 the expected text of step 9 of the test guide; M6 the typo "onPortss"; M7 the catch of AppBar.tsx drops the error.
Ruling: I2 — AppBar keeps its own fallback text for a thrown or rejected onRename and logs the error to the console; the import of ../views/ is removed — the catalog does not depend on the views (Decision 12) — cost if wrong: one string.
Ruling: I3 — MODIFIED deltas of hub/link and renderer-pixi/page in the change, with the scenarios "the same IDs after a new link" and "new IDs after id-in-use", with openspec-update-change — cost if wrong: none, the code already does it.
Ruling: the fix wave takes I1, I2, I3, M1 to M7; findHolds two times stays deferred. The changeset at the finish adds `@thrashplay/wishem-pixi-page` patch (its link IDs are stable now).
Final review: fix wave dispatched (one implementer, sonnet), base 00162c56.

## State at the end of the session of 2026-11-27

- NEXT STEP: the final review (opus), with the test guide and the check of the architecture document.

## For the review issue of the milestone A3

- UI option A was selected (the title of the app bar is the control). Options B and C are in `design.md` under "UI options for the owner".
- Each view gets a reserved prop `wishem` with `setField` and `submit`; the renderer gets an optional second port `input`; the page opens one link with two subsystems and keeps one source ID for each page load.
- New field types: `number`, `boolean`, `reference`. The store refuses `remove-entity` for an entity that a different entity refers to.

## Files in common with other changes in work

- #536: the architecture document, `render.mjs`, the entity diagram SVGs, `glossary.md`, `concepts.md`, `workbench-app/README.md`, and the requirement "The entity diagram of the model folder" of `wishem/architecture/diagrams`. The second to archive must merge the requirement.
- #540: `workbench-app/src/hub-client.ts` (and `hub/src/link/connect-link.ts` if #540 merges first), the architecture document, `render.mjs`, `concepts.md`, `glossary.md`. Whichever merges second makes `connectLink` keep one ID for each client.

Final review: fix wave implemented, commit 84625235 (workbench-app 287, renderer-react 198; the I2 test failed 2, then passed 28; the new deltas hub/link and renderer-pixi/page validate, with two warnings of text over 500 characters as in the main specs; the diagram rendered two times with identical SVG, check-svg passes). Concerns: the architecture delta has no scenario for the relationships of renderer-react (none added); pixi-page changeset at the finish; test:ui not run (AppBar look unchanged). Re-review dispatched (sonnet), range 00162c56..84625235.
