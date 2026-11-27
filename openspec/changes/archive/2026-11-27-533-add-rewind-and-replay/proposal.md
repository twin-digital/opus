---
issue: https://github.com/twin-digital/opus/issues/533
milestone: https://github.com/twin-digital/opus/milestone/16
---

# Proposal

## Why

Rule R3 says that a construct can be recorded, replayed, and rewound. The hub keeps the record now, but no part of Wishem can return a construct to an earlier point or run a record again in a new construct. The milestone "A2 Time" needs these operations, and the agent needs them to run the exact inputs of the designer again.

The review of the milestone "A1 Construct" also found three faults that block a rewind: each listener uses `applied` as its only signal of a change, the record has no limit and some listeners do much work on each tick, and no name is reserved for the hub.

## What Changes

- The hub declares the reserved input type `hub/rewind` with the payload `{ seq }`. The hub applies it itself: the joined state becomes the joined state after the input `seq`. The rewind is an input in the record, so a replay gives the same result. It gets a sequence number and the usual `applied` event, so each listener and each client of the link acts after a rewind with no new event and no new message.
- The ID `hub` and each input type `hub/<name>` are reserved. A model subsystem, an attached I/O subsystem, and a client of the link cannot take them.
- The hub keeps checkpoints: references to the joined state at the start of the record, at each `checkpointInterval` accepted inputs, and after each rewind. A rewind restores the last checkpoint at or before the target and applies the inputs after it again.
- The record has a limit (`recordLimit`). When the record is too long, the hub removes the oldest inputs up to a checkpoint. That checkpoint becomes the start of the record.
- `Hub.record()` gives the inputs after the start of the record. `Hub.recordStart()` gives the start. `Hub.seq` gives the sequence number of the last accepted input with no copy.
- Replay: `createHub` takes an optional `record`. The new hub starts from the start of the record and applies its inputs before it starts. It gives the same joined state. An input that the subsystems refuse during a replay causes a `ReplayError`.
- The link stays at version 1. `welcome` reads `Hub.seq`. `serve-link.ts` handles each hub event type by name, and a check of the type makes the list complete. `LINK.md` documents `hub/rewind` and the reserved ID.
- The clock sets its last real time again after a rewind.
- The writer of `state.json` and the generator of the view types compare the parts by identity first. A rewind that changes the entities writes `state.json`.
- A test in the `clock` package proves that the same record gives the same joined state with the store and `time`, and that a rewind gives the state of its target.
- The blueprint (`concepts.md`, `glossary.md`) records that a restore is the `applied` event of `hub/rewind`, and records the record limit.

## Capabilities

### New Capabilities

- `wishem/hub/record`: the record, its start and its limit, the checkpoints, the input `hub/rewind`, and the replay of a record in a new hub.

### Modified Capabilities

- `wishem/hub/construct`: the reserved ID `hub` and the reserved input types; the record requirement points to `wishem/hub/record`; `Hub.seq`; the hub events include the rewind as an `applied` event.
- `wishem/hub/link`: the ID `hub` is refused with `id-in-use`; a rewind reaches a client as an `applied` message; the hub side handles each hub event by name.
- `wishem/clock/time`: the clock sends no ticks for real time that passed before a rewind.
- `wishem/host-nodejs/model-folder`: a rewind that changes the entities writes `state.json`.
- `wishem/renderer-html/view-types`: a rewind that changes the definitions runs the generator.

## Impact

- `nodejs/wishem/hub`: `hub.ts`, `types.ts`, `names.ts`, `errors.ts`, `index.ts`, `link/serve-link.ts`, `README.md`, `LINK.md`, and their tests.
- `nodejs/wishem/clock`: `clock.ts`, a new test of replay, and a development dependency on `@thrashplay/wishem-core`.
- `nodejs/wishem/host-nodejs`: `model-folder-storage.ts`.
- `nodejs/wishem/workbench-app`: `scripts/start.ts`.
- `nodejs/wishem/docs`: `concepts.md`, `glossary.md`.
- No new package, process, or store of data. The C4 container level does not change.
