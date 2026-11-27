---
issue: https://github.com/twin-digital/opus/issues/529
milestone: https://github.com/twin-digital/opus/milestone/15
---

# Proposal

## Why

The definitions and the entities of a model are held by `createCore`, which has no write operation: the only change is a full new model from the files. The workbench must change one value of the product, and each change must be an input in the record of a hub. The owner decided that the model is not a property of the hub and that the model subsystems hold it. The architecture is in [#527](https://github.com/twin-digital/opus/issues/527).

## What Changes

- The store: a model subsystem for a hub of `@thrashplay/wishem-hub`. Its part of the joined state is a model: the definitions and the entities.
- Four inputs: replace the model, add an entity, remove an entity, and set a field value. The store refuses an input that makes the model incorrect, with the list of problems, and its part does not change.
- The source of an input supplies the ID of a new entity, so a replay gives the same ID.
- `@thrashplay/wishem-core` exports `createStore`. It depends on `@thrashplay/wishem-hub`.

`createCore` stays in this change. [#531](https://github.com/twin-digital/opus/issues/531) moves the workbench to the hub and removes it. The names of the package and of the specifications change in [#518](https://github.com/twin-digital/opus/issues/518).

## Capabilities

### New Capabilities

- `wishem/core/store`: the model subsystem that holds the definitions and the entities: its part of the joined state, its inputs, and its refusals.

### Modified Capabilities

None.

## Impact

- `@thrashplay/wishem-core`: new exports and a new dependency on `@thrashplay/wishem-hub`. The package still uses no Node.js API.
- The packages that depend on `@thrashplay/wishem-core` do not change.
- Not in this change: a mounted product model ([#536](https://github.com/twin-digital/opus/issues/536)), more field types ([#535](https://github.com/twin-digital/opus/issues/535)), an input that changes one definition, and the storage in files ([#531](https://github.com/twin-digital/opus/issues/531)).
