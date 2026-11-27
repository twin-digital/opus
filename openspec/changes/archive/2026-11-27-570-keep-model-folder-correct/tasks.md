# Tasks

## Task 1: The write of state.json waits while the definitions differ

Files: `nodejs/wishem/host-nodejs/src/model-folder-storage.ts`, `nodejs/wishem/host-nodejs/src/model-folder-storage.test.ts`, `nodejs/wishem/host-nodejs/src/model-folder-storage.controlled.test.ts` (only when a test there needs a change), `nodejs/wishem/host-nodejs/src/start-construct.test.ts`, `.changeset/570-keep-model-folder-correct.md`
Interfaces: no change to an export. Internal: a flag `held` in `attachModelFolderStorage`, false at the start. Terminal lines, exactly:

- line 1: `wishem: the definitions of the store differ from the files in definitions, so state.json is not written`
- line 2: `wishem: the definitions of the store are equal to the files in definitions again`

Behavior: at its start, `write` compares `current().definitions` with `synced.definitions` with `sameDefinitions` (order counts). When they differ, it writes nothing, keeps `synced`, prints line 1 only when `held` is false, and sets `held` to true. When they are equal and `held` is true, it prints line 2, sets `held` to false, and continues with the comparison of the entities as now. Specification: `openspec/changes/570-keep-model-folder-correct/specs/wishem/host-nodejs/model-folder/spec.md`, requirements "A change of the entities is written to state.json", "The model folder that the process writes always starts", and "The process reports definitions that the model folder does not hold".

- [x] 1.1 Add tests to `model-folder-storage.test.ts` for each scenario of "The model folder that the process writes always starts" (a new component type with an entity in one `replace-model`; a new component type, then `add-entity`; a new field, then `set-field`; a removed component type) and of "The process reports definitions that the model folder does not hold" (two inputs give line 1 one time; differ, equal, differ gives line 1 two times and line 2 one time). For "equal again" here, use an input: `replace-model` with the definitions of the disk. Extend the test "does not write for a change of a definition only" to expect line 1. Verify that each new test fails before the code changes, and record the failing run.
- [x] 1.2 Change the test "leaves the definitions folder as it is" so that it does not wait for a write of `state.json` after a change of a label: it sends the `replace-model` and a `set-field`, waits, and expects that the `definitions` folder and `state.json` did not change.
- [x] 1.3 Add a test to `start-construct.test.ts` for the steps of issue #570: start a construct on a copy of a model folder, open a link as an input subsystem (with the `WebSocket` of `ws`, as the other tests of the file do), send `store/replace-model` with a new component type and an entity that uses it, close the construct, then start a new construct on the same folder. Expect that the second start does not reject, and that the log of the first construct has line 1. Verify that it fails before the code change.
- [x] 1.4 Implement the hold and the two lines in `write` of `model-folder-storage.ts`. Verify with `flock -w 15 /tmp/wishem-heavy.lock timeout 140 pnpm exec turbo run test --filter @thrashplay/wishem-host-nodejs` that each test of the package passes.
- [x] 1.5 Add the changeset `.changeset/570-keep-model-folder-correct.md`: `'@thrashplay/wishem-host-nodejs': patch`, with a summary in Simplified Technical English. Verify that lint and the type check of the package pass, each with the lock as in 1.4.

## Task 2: A read that makes the definitions equal, and the line at the stop

Files: `nodejs/wishem/host-nodejs/src/model-folder-storage.ts`, `nodejs/wishem/host-nodejs/src/model-folder-storage.test.ts`, `nodejs/wishem/host-nodejs/src/model-folder-storage.controlled.test.ts`
Interfaces: consumes the hold of Task 1 (`held`, line 1 and line 2 in `write`). Produces line 3, exactly: `wishem: the process stops, and the model folder does not hold the last changes of the store`

Behavior: after each correct read (the read reaches `synced = read`), `read` requests a write with `requestWrite`, so a hand edit of the files that makes the definitions equal to the store writes the entities that wait, also when the read sends no input. In `close`, after the queue is empty, when `current().definitions` differ from `synced.definitions` (a fresh comparison, not `held`), the subsystem prints line 3. `close` gives the same promise on each call, so line 3 shows at most one time. Specification: requirements "The entities are written when the definitions are equal again" and "The process reports a stop that loses changes" of `openspec/changes/570-keep-model-folder-correct/specs/wishem/host-nodejs/model-folder/spec.md`.

- [x] 2.1 Add tests for "A person adds the definition file": a client adds a component type and an entity that uses it with `replace-model`; the test then writes a definition file for that type, with a name that sorts so that the order on the disk is the order of the store. Expect no new input in the record of the hub, line 2, `state.json` with the new entity, and a correct model from `readModelFolder` and `validateModel`. Verify that the test fails before the code change, and record the failing run.
- [x] 2.2 Add tests for "The process reports a stop that loses changes": a label change through `replace-model`, then `close`, gives line 3 one time, also when `close` is called two times; `state.json` and the `definitions` folder do not change. A title change and `close` give no line 3. Verify that the first test fails before the code change.
- [x] 2.3 Implement the request for a write after a correct read, and line 3 in `close`. Do not change the existing tests of "A write of the model folder does not come back as a change" and of the queue in `model-folder-storage.controlled.test.ts`: they prove that the new request gives no second write and no loop. Verify with `flock -w 15 /tmp/wishem-heavy.lock timeout 140 pnpm exec turbo run lint typecheck test --filter @thrashplay/wishem-host-nodejs` that each check passes. If the command does not end in 140 seconds, run lint, typecheck, and test as three commands.

## Workflow follow-up

- Break-test `@thrashplay/wishem-host-nodejs` with the `break-test` skill, by `nodejs/wishem/docs/break-test-rules.md`, before the final review. Other packages depend on it.
- Archive the change, which moves the delta into `openspec/specs/wishem/host-nodejs/model-folder/spec.md`.
- Create a follow-up issue for each line of "Follow-up" in `design.md`.
- Finish with `superpowers:finishing-a-development-branch`, and select the pull request.
