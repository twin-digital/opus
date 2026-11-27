---
issue: https://github.com/twin-digital/opus/issues/570
milestone: https://github.com/twin-digital/opus/milestone/15
---

# Proposal

## Why

The storage subsystem can write a `state.json` that does not agree with the files in `definitions`. The model folder then does not start, and a person must correct it by hand. A change of the definitions through an input is also lost with no message when the process stops. This must be correct before the workbench edits the model through the link (#535).

## The fault, confirmed in the code

The store keeps its definitions and its entities correct together: each input of `@thrashplay/wishem-core` (`replace-model`, `add-entity`, `remove-entity`, `set-field`) validates the full next model. Thus the store never holds a model that is not correct. The fault is between the store and the disk:

1. The hub accepts `store/replace-model` from each input subsystem. It checks only the kind of the port (`hub/src/hub.ts`, `submit`). A client of the link is an input subsystem.
2. `write` in `host-nodejs/src/model-folder-storage.ts` compares only the entities of the store with `synced.entities`. When they differ, it writes the entities to `state.json`. It never compares the definitions of the store with the definitions on the disk (`synced.definitions`).
3. By decision 4 of the design of #531, the subsystem writes no definition file.

The path that makes the bad folder: a client sends `store/replace-model` with a new component type and an entity that uses it. The store accepts it. The `applied` event starts `write`. The entities differ from `synced.entities`, so `state.json` gets a component of a type that no file in `definitions` declares. The next read gives the problem "has a component of the type … which is not defined" in `state.json`, and `startConstruct` rejects with `ModelError`.

Variants that the issue does not name:

- **Two inputs, each correct.** A client sends `replace-model` that changes only the definitions, for example a new component type, or a new field of an existing component type. `write` sees equal entities and writes nothing. Later, `add-entity` or `set-field` uses the new type or the new field. The store accepts it, because its definitions have it. `write` then writes `state.json`, and the folder does not start. Each input is correct for the store, and no input carries the bad model alone.
- **A removed definition.** A client sends `replace-model` that removes a component type, or a field, and removes its use from each entity. `write` writes the entities. The folder still starts, because the files in `definitions` still declare the removed type. But the removal is lost with no message.
- **A change of the order only.** A client sends the same definitions in a different order. The model folder gives the order of the file names, so it cannot keep the order. The change is lost with no message.

No variant occurs without a change of the definitions through an input: `add-entity`, `remove-entity`, and `set-field` keep the definitions of the store, and the files and the store use the same `validateModel`. A read of the folder never writes. Thus each bad folder and each lost change starts when the definitions of the store become different from the definitions on the disk.

## What Changes

- The storage subsystem does not write `state.json` while the definitions of the store differ from the definitions that it last read from the disk.
- When that state starts, the process prints one line that says so. While the state continues, it prints no more such lines.
- When the definitions become equal again, through an input or through a hand edit of the files, the process prints one line, and the storage subsystem writes the entities that wait.
- When the process stops while the definitions differ, it prints one line that says that the model folder does not hold the last changes of the store.
- The specification `wishem/host-nodejs/model-folder` gives the rule.

No interface changes. The store and the hub do not change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wishem/host-nodejs/model-folder`: the requirement "A change of the entities is written to state.json" gets the condition that the definitions are equal to the disk. A new requirement "The model folder that the process writes always starts" gives the hold of the write and the three lines of the terminal.

## Impact

- Code: `nodejs/wishem/host-nodejs/src/model-folder-storage.ts` and its tests, and one test in `start-construct.test.ts` through the link.
- Package: `@thrashplay/wishem-host-nodejs` (private), a patch.
- No change to the architecture: no container and no relationship changes. The schema of the model folder does not change.
