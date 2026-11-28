---
issue: https://github.com/twin-digital/opus/issues/606
milestone: https://github.com/twin-digital/opus/milestone/18
---

# Proposal

## Why

A `reference` field names one entity. A product that needs one entity to hold many entities, such as a list of tasks or a deck of cards, has no field type for it. The change #535 recorded this as a follow-up.

## What Changes

- Add the field type `reference-list`. Its value is a list of entity IDs of the same model, with no ID two times. The order of the list is part of the value.
- The validation refuses a list that is not a list, an item that is not an entity ID, an ID that no entity has, and an ID that is in the list two times.
- `isEqual` compares two JSON values of any kind, not only two models. `set-field` compares the old value and the new value with `isEqual`, and gives the same part object when the two values are equal. Two lists with the same IDs in a different order are not equal.
- Add the store inputs `add-reference` and `remove-reference`. `add-reference` adds one entity ID at the end of a list. `remove-reference` removes one entity ID from a list. An input that changes nothing gives the same part object.
- `remove-entity` refuses the removal of an entity that a list of a different entity names, as it does for a `reference` field.
- The React renderer: an entity that a `reference-list` field of a component with a view names is held, by the rule of a held entity of #535. The prop of the field is a list of pictures, one for each ID, in the order of the list. The generator writes `readonly string[]` in `Values` and `readonly ReactNode[] | undefined` in `Props`.
- The PixiJS renderer and the Godot renderer give the prop of a `reference-list` field as the list of entity IDs. They hold no entity.
- The product panel of the workbench shows a `reference-list` field as a list of entities, each with a button that removes it, and a select and a button that add an entity. The buttons send `product/add-reference` and `product/remove-reference`.
- The blueprint, the glossary, the READMEs, and the entity diagram of the model folder show the new field type. The relationship "Refers to" gets the mark "zero or more" at `Entity`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wishem/core/model`: the field type `reference-list` and the rules of its value.
- `wishem/core/store`: the inputs `add-reference` and `remove-reference`, the comparison of a list in `set-field`, and the refusal of `remove-entity` for an entity that a list names.
- `wishem/renderer-html/renderer`: an entity that a list names is held.
- `wishem/renderer-html/views`: the prop of a `reference-list` field is a list of pictures.
- `wishem/renderer-html/view-types`: the types of a `reference-list` field in `Values` and `Props`.
- `wishem/renderer-pixi/renderer`: the prop of a `reference-list` field is the list of IDs.
- `wishem/renderer-godot/renderer`: the prop of a `reference-list` field is the list of IDs.
- `wishem/workbench/product-panel`: the control of a `reference-list` field, and the inputs that it sends.
- `wishem/design-system/component-catalog`: the field row of a list of references, and its specimens in the style guide.
- `wishem/architecture/diagrams`: the mark of the relationship "Refers to" in the entity diagram of the model folder.

## Impact

- `@thrashplay/wishem-core`: `FieldType`, `FIELD_TYPES`, `FieldValue`, `isEqual`, `validateModel`, the store, `storeInputs`, and the new type `ReferencePayload`.
- `@thrashplay/wishem-renderer-react`: `findHolds`, `Renderer`, and `renderViewTypes`.
- `@thrashplay/wishem-renderer-pixi` and `@thrashplay/wishem-renderer-godot`: tests and the type of the props. No change of the source of Godot.
- `@thrashplay/wishem-workbench-app`: `FieldRow`, `EntityInspector`, `ProductPanel`, `ProductTool`, the style guide, the screenshot baselines, and the browser tests of the product.
- Each package that reads `FieldValue` gets the wider type. A type check of the dependents of `core` finds each place that needs a change.
- `nodejs/wishem/docs/`: `concepts.md`, `glossary.md`, `architecture/README.md`, `architecture/render.mjs`, and the two SVG files of the entity diagram.
- No package, no process, and no import between packages is added or removed.
