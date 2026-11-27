# Tasks

Run each lint, type check, and test command under the lock, as `nodejs/wishem/CLAUDE.md` says: `flock -w 15 /tmp/wishem-heavy.lock timeout 140 <command>`. The specs are in `openspec/changes/533-add-rewind-and-replay/specs/`. The design is `openspec/changes/533-add-rewind-and-replay/design.md`.

## Task 1: The record has a start, checkpoints, and a limit

Files: `nodejs/wishem/hub/src/types.ts`, `nodejs/wishem/hub/src/names.ts`, `nodejs/wishem/hub/src/hub.ts`, `nodejs/wishem/hub/src/index.ts`, `nodejs/wishem/hub/src/hub.record.test.ts` (new), `nodejs/wishem/hub/src/names.test.ts`, `nodejs/wishem/hub/src/link/serve-link.ts`, `nodejs/wishem/hub/README.md`, `nodejs/wishem/docs/glossary.md`, `nodejs/wishem/docs/concepts.md`
Interfaces: produces `HUB_ID`, `REWIND_INPUT_TYPE`, `Checkpoint`, `HubRecord`, `HubOptions.checkpointInterval`, `HubOptions.recordLimit`, `Hub.seq`, `Hub.recordStart()` (design.md, Interfaces); `Hub.record()` keeps its type and gives the inputs after the start

- [x] 1.1 Reserve the ID `hub` and the input types `hub/<name>`: `createHub` refuses a model subsystem with the ID `hub` or with a declared type that starts with `hub/`, and `attach` refuses the ID `hub`, each with a `HubConfigurationError` that names the ID or the type (D2). Verify with tests in `hub.record.test.ts` that fail before the code
- [x] 1.2 Add `Hub.seq` and use it in `serveLink` for the `seq` of `welcome` in place of `hub.record().at(-1)` (D6). Verify with a test of `Hub.seq` after accepted and rejected inputs, and with the tests of `serve-link.test.ts`
- [x] 1.3 Keep checkpoints at the start, at each multiple of `checkpointInterval`, as references to the frozen joined state (D3), and add `Hub.recordStart()`. Verify with a test that the start of a new hub is `{ seq: 0, state }` with the first joined state
- [x] 1.4 Add `recordLimit` with the move of the start to the first valid checkpoint (D4). Rewinds do not exist yet, so each checkpoint is valid in this task; leave one function that Task 2 extends with the rule of validity. Verify the scenario "A record that is too long" (limit 200, interval 100, 250 inputs) and the refusal of a limit smaller than the interval and of values that are not positive integers
- [x] 1.5 Export the new names from `index.ts`. Document the start, the checkpoints, the limit, `seq`, and the reserved names in `hub/README.md`. Update **Record** and **Checkpoint** in `glossary.md` and "Inputs and the record" in `concepts.md` with the facts of D3 and D4
- [x] 1.6 Verify: `pnpm exec turbo run lint typecheck test --filter @thrashplay/wishem-hub` passes

## Task 2: The input hub/rewind

Files: `nodejs/wishem/hub/src/types.ts`, `nodejs/wishem/hub/src/hub.ts`, `nodejs/wishem/hub/src/index.ts`, `nodejs/wishem/hub/src/hub.rewind.test.ts` (new), `nodejs/wishem/hub/README.md`, `nodejs/wishem/docs/glossary.md`, `nodejs/wishem/docs/concepts.md`
Interfaces: consumes the checkpoints and the limit of Task 1; produces `RewindPayload`, `hubInputs.rewind(seq)`, and the behavior of `hub/rewind` (spec `wishem/hub/record`)

- [x] 2.1 Apply `hub/rewind` in the hub: take the last checkpoint at or before the target, give the inputs after it up to the target to the model subsystems again with the same context as the first apply, append the rewind with the next number, keep a checkpoint after it, and send one `applied` event (D1, D3). Verify each scenario of "A rewind returns the construct to an earlier point" and "A rewind restores the last checkpoint and applies the inputs after it again" with tests that fail before the code; count the calls of `apply` for the scenario "A target between two checkpoints"
- [x] 2.2 Reject a target that is not an integer, is before the start, or is after `Hub.seq` with `invalid` and a problem at `['payload', 'seq']`. When a model subsystem throws during the new apply, change nothing and reject the promise with the error. Reject each other `hub/<name>` type with `unknown-type`. Verify with tests
- [x] 2.3 Extend the move of the start of Task 1 with the rule of validity of D4: a checkpoint is valid when each rewind in the record after it has a target at or after it. Verify with a test in which a rewind to an early target holds the start back, and the start then moves to the checkpoint of the rewind, and the record never holds more inputs than the limit
- [x] 2.4 Add `hubInputs.rewind(seq)` and export it. Document the rewind in `hub/README.md` with an example. In `glossary.md`, make **Hub event** list three events and make **Rewind** say that the rewind is the input `hub/rewind` with the event `applied`. In `concepts.md`, make the list of hub events three items, and replace the link to #533 in "Model subsystems" with the link to the follow-up issue that the brief gives
- [ ] 2.5 Verify: `pnpm exec turbo run lint typecheck test --filter @thrashplay/wishem-hub` passes

## Task 3: Replay from a record

Files: `nodejs/wishem/hub/src/types.ts`, `nodejs/wishem/hub/src/errors.ts`, `nodejs/wishem/hub/src/hub.ts`, `nodejs/wishem/hub/src/index.ts`, `nodejs/wishem/hub/src/hub.replay.test.ts` (new), `nodejs/wishem/hub/src/errors.test.ts`, `nodejs/wishem/hub/README.md`, `nodejs/wishem/docs/concepts.md`
Interfaces: consumes `hub/rewind` of Task 2; produces `HubOptions.record` and `ReplayError` (design.md, Interfaces)

- [x] 3.1 Add the option `record`: take `start.state` as the joined state and as the first checkpoint, and apply each input with its source and its number before `createHub` returns, with no event (D5). Verify the scenarios "A replay" and "A replay with a rewind in the record" with tests that fail before the code, with a counter subsystem and two model subsystems
- [x] 3.2 Throw a `HubConfigurationError` for a gap in the numbers or for a start whose keys are not the IDs of the model subsystems, and a `ReplayError` with `seq` and `problems` for an input that a model subsystem refuses or that throws. Verify the scenarios of "A record that does not apply stops the replay"
- [x] 3.3 Export `ReplayError`. Document the replay in `hub/README.md` with the call `createHub({ subsystems, record: { start: hub.recordStart(), inputs: hub.record() } })`. In `concepts.md`, give the replay as an option of the hub in the table of operations of "Time"
- [x] 3.4 Verify: `pnpm exec turbo run lint typecheck test --filter @thrashplay/wishem-hub` passes

## Task 4: The link carries a rewind

Files: `nodejs/wishem/hub/src/link/serve-link.ts`, `nodejs/wishem/hub/src/link/serve-link.test.ts`, `nodejs/wishem/hub/src/link/open-link.test.ts`, `nodejs/wishem/hub/src/link/examples.ts`, `nodejs/wishem/hub/src/link/examples.test.ts`, `nodejs/wishem/hub/LINK.md`
Interfaces: consumes `hub/rewind` of Task 2 and `Hub.seq` of Task 1; the messages of the link do not change

- [x] 4.1 Make `serveLink` handle `started`, `applied`, and `stopping` by name, with a `never` check of `HubEvent` in the last branch, so that only `stopping` closes the link (D7). Verify that the type check fails when a test adds a fourth type to a local copy of the union, then remove that copy, and verify the tests of `serve-link.test.ts`
- [x] 4.2 Verify with tests that a rewind on a link reaches a remote port of version 1 as one `applied` message with the next sequence number and the changed parts, that the link stays open, and that a read gives the state after the target (scenario "A rewind on a link"). Verify that a `hello` with the ID `hub` gets `refused` with `id-in-use`
- [x] 4.3 In `LINK.md`, add a section on the reserved ID `hub` and the input `hub/rewind` (payload, the rejection, the `applied` message that it causes), and an example of a rewind on a link from design.md. Add the example messages to `examples.ts` so that `examples.test.ts` checks them against the hub side
- [x] 4.4 Verify: `pnpm exec turbo run lint typecheck test --filter @thrashplay/wishem-hub` passes

## Task 5: The clock after a rewind, and the proof of replay

Files: `nodejs/wishem/clock/src/clock.ts`, `nodejs/wishem/clock/src/clock.test.ts`, `nodejs/wishem/clock/src/replay.test.ts` (new), `nodejs/wishem/clock/package.json`, `pnpm-lock.yaml`, `nodejs/wishem/clock/README.md`
Interfaces: consumes `REWIND_INPUT_TYPE`, `hubInputs.rewind`, `HubOptions.record`, `Hub.recordStart()` from `@thrashplay/wishem-hub`, and `createStore`, `storeInputs`, `isEqual` from `@thrashplay/wishem-core`

- [x] 5.1 Set `last = now()` in the clock on the `applied` event of `hub/rewind` (D10). Verify the two scenarios of "The clock sends no late ticks after a rewind" with the fake timer and the fake `now` of `clock.test.ts`, with tests that fail before the code
- [x] 5.2 Add `@thrashplay/wishem-core` (`workspace:*`) to the `devDependencies` of `clock`, and run `pnpm install` (D11). Verify that `pnpm install` succeeds and that `core` does not depend on `clock`
- [x] 5.3 Write `replay.test.ts`: a hub with the store and `time`, a clock with a fake timer, `store/add-entity`, `store/set-field`, `time/set-running`, and ticks, then one `hub/rewind`, then more inputs. Verify that the joined state after the rewind is `isEqual` to the state that the test kept at the target, and that a second hub made with new, equal subsystems and the record of the first hub has a joined state that is `isEqual` to the first one and the same `seq`. Also run the replay with `checkpointInterval` 3 and `recordLimit` 6, so that the record has a start that is not 0
- [x] 5.4 Document the behavior after a rewind in `clock/README.md`
- [x] 5.5 Verify: `pnpm exec turbo run lint typecheck test --filter @thrashplay/wishem-clock` passes

## Task 6: The listeners of the workbench compare by identity

Files: `nodejs/wishem/host-nodejs/src/model-folder-storage.ts`, `nodejs/wishem/host-nodejs/src/model-folder-storage.test.ts`, `nodejs/wishem/workbench-app/scripts/start.ts`, `nodejs/wishem/workbench-app/src/start.test.ts`
Interfaces: consumes `hubInputs.rewind` of Task 2

- [ ] 6.1 In the writer of `state.json`, do nothing when the `store` part is the same object as at the last check or the entities are the same array as the last entities read or written, before the `isEqual` comparison (D8). Verify with a test that fails before the code: an input of a different model subsystem causes no comparison of the entities (count the calls of the comparison). Add a test of the scenario "A rewind before a change of the title". That test can pass before this step, because a rewind is an `applied` event; it guards the behavior of D8
- [ ] 6.2 In `keepViewTypesCurrent` of `start.ts`, keep the last `definitions` array and do nothing when it is the same object, before the JSON comparison (D9). Verify with a test in `src/start.test.ts` that fails before the code: an input that does not change the store does not change the definitions into JSON text (count the calls). Add a test of the scenario "A rewind before a change of a label"
- [ ] 6.3 Verify: `pnpm exec turbo run lint typecheck test --filter @thrashplay/wishem-host-nodejs` passes, then `pnpm exec turbo run lint typecheck test --filter @thrashplay/wishem-workbench-app` passes, each as its own command

## Workflow follow-up

- Before the apply step, the lead agent creates the follow-up issues of the section "Follow-up" of design.md, and gives the number of the snapshot issue to the implementer of Task 2.
- Break-test `@thrashplay/wishem-hub`, which other packages depend on, with the `break-test` skill before the final review.
- Add a changeset that matches the Package Impact table of design.md.
- Archive the change, then finish with `superpowers:finishing-a-development-branch`.
