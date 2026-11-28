---
issue: https://github.com/twin-digital/opus/issues/630
milestone: https://github.com/twin-digital/opus/milestone/18
---

# Proposal

## Why

A change of the authored state that adds or removes an entity goes to each running product construct as one `store/replace-model` (#538). That replaces the live values of each other entity: a paused `play` with a count of `25` goes back to the authored count when the designer adds a second entity. After #607, only a change of values keeps the live values. This change gives the same result for an entity that is added or removed.

## What Changes

- The construct manager sends a change of the authored state that adds or removes entities as `store/add-entity`, `store/remove-entity`, `store/set-field`, and `store/clear-field` inputs. The live values of each entity that the two models both hold stay, except the values that the change itself changes.
- An added entity gets the position that it has in the authored state. A removed entity leaves the others in their order. Thus the live order of the entities is the authored order, and the update subsystem runs the behaviors in the same order as before.
- The inputs go in an order that the store accepts at each step: an added entity that names an entity that is not yet in the store gets that value in a later `set-field`, and a reference between two removed entities is cleared before the removals. A `reference-list` field follows the same rules as a `reference` field, and a changed list goes as one `set-field` of the full list.
- A rewind of the workbench and a step back of a product construct send the same inputs, through the link of the product construct process on the IPC channel. Thus the undo of a removal puts the entity back at its position, and the other entities keep their live values.
- The input `add-entity` of the store gets an optional `index`: the position of the new entity in the list. With no `index`, the entity goes at the end, as now. The store refuses an `index` that is not an integer from 0 to the number of entities.
- `storeInputs(id).addEntity(entity, index?)` makes the input with the index.
- A change of the definitions, a new order of the entities that the two models both hold, and a component that is added to or removed from such an entity still give one `store/replace-model`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wishem/core/store`: the input `add-entity` takes an optional position.
- `wishem/workbench/construct-manager`: an added or removed entity goes to a running product construct as inputs that keep the live values of the other entities, also after a rewind of the workbench and after a step back.

## Impact

- `nodejs/wishem/core`: `src/store.ts`, `src/store.test.ts`, `src/store.hub.test.ts`, `README.md`.
- `nodejs/wishem/construct-manager`: `src/product-changes.ts`, `src/product-changes.test.ts`, `src/construct-manager.test.ts`, `src/construct-manager.child.test.ts`, `README.md`. `src/construct-manager.ts`, `src/launchers.ts`, `src/ipc-channel.ts`, and `src/product-construct-process.ts` do not change: the construct manager already sends the result of `productChanges` through the port `input` of the launcher after a change of the product and after a step back.
- `nodejs/wishem/workbench-app`: `tests/run.guide.spec.ts` only.
- No new package, no new import between packages, and no change of a process or of the link. The architecture document does not change.
