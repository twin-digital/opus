---
issue: https://github.com/twin-digital/opus/issues/607
milestone: https://github.com/twin-digital/opus/milestone/18
---

# Proposal

## Why

The store refuses `remove-entity` for an entity that a reference field of a different entity names (#535). No input removes a field value, so a person cannot clear the reference before the removal of the entity. A field value that a person sets also cannot go back to "no value". This change adds the input that clears a field value, and the product panel of the workbench (#537) gets a control that sends it.

## What Changes

- The store gets the input `<store>/clear-field`. Its payload holds the ID of an entity, the ID of a component type, and the ID of a field. The store removes the value of that field from the component of the entity. The component stays, also when it then holds no value.
- A `clear-field` of a value that does not exist (no value, or no component of that type) is accepted and gives the same part object.
- The store refuses `clear-field` when the entity does not exist, when the component type is not defined, or when the field is not a field of the component type, with the same problems as `set-field`.
- `storeInputs(id)` gets `clearField(payload)`, and `@thrashplay/wishem-core` exports the type `ClearFieldPayload`.
- The update subsystem applies `clear-field` of the store that it wraps, as it applies each other input of the store.
- The construct manager sends a value that the authored state no longer holds to each running product construct as one `store/clear-field`, not as `store/replace-model`. Thus the live values of the product construct stay. A rewind of the workbench that restores the value sends `store/set-field`, as now.
- The product panel gets a `Clear` button in each field row, for each of the four field types. A press sends one `product/clear-field` input through the input port of the page. The button is disabled when the field has no value, while a change of the row waits, and when the page has no input port. A rejection shows `The value is not cleared.` and the reason.
- A clear is an input of the record of the workbench, so a rewind of the workbench restores the value in the panel and in the `state.json` of the product folder.
- The `Button` component of the catalog gets an optional accessible name, so that each `Clear` button has the name `Clear <field label>`.
- The test from end to end of the three renderers sends `store/clear-field` for its step "no value", in place of `store/replace-model`. It proves that the React page, the PixiJS page, and the Godot application draw the fallback color after a real clear.
- The architecture document says that the product panel sends `product/set-field` and `product/clear-field`. The C4 levels do not change.
- `page-driver.mjs` of the A4 milestone gets the step `clear:<Component>.<field>`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wishem/core/store`: the input `clear-field`, its refusals, and the same part for a value that does not exist.
- `wishem/workbench/product-panel`: the `Clear` control of a row, the input that it sends, its states, and the undo of a clear by a rewind.
- `wishem/workbench/construct-manager`: a cleared value goes to a running product construct as `store/clear-field`.
- `wishem/design-system/component-catalog`: the `Clear` button of the field row, the specimen "Field row, not cleared", and the accessible name of a button.
- `wishem/renderers/end-to-end-test`: the step "no value" sends `store/clear-field`.
- `wishem/architecture/diagrams`: the component diagram of the page names the two inputs of the product panel.

## Impact

- `nodejs/wishem/core`: `src/store.ts`, `src/index.ts`, their tests, `README.md`.
- `nodejs/wishem/update`: tests only, and a changeset, because the wrap passes the new input type.
- `nodejs/wishem/construct-manager`: `src/product-changes.ts`, its tests, `README.md`.
- `nodejs/wishem/workbench-app`: `FieldRow`, `EntityInspector`, `ProductPanel`, `Button`, `ProductTool`, the style guide, the Playwright tests and their baselines, `README.md`.
- `nodejs/wishem/three-renderers`: the test from end to end only.
- `nodejs/wishem/docs`: the architecture document and `render.mjs`, `glossary.md`, `docs/milestones/a4-workbench/page-driver.mjs`.
- No new package and no new import between packages. The renderers do not change: a view that gets no value already draws its fallback (#743).
