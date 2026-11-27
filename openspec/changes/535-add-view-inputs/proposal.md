---
issue: https://github.com/twin-digital/opus/issues/535
milestone: https://github.com/twin-digital/opus/milestone/17
---

# Proposal

## Why

A React view can only draw now. It cannot send an input, a field can only hold text, and a view cannot draw a different entity. The workbench tool of #537 must change a field value of an entity from a form, and the tools and products after it need numbers, flags, and one thing that holds other things. This change gives the view system that complete minimum.

## What Changes

- **Inputs from a view.** Each view gets the reserved prop `wishem`. It has `setField(name, value)`, which sends `store/set-field` for a field of the component of the view, and `submit(input)`, which sends any input. Each call gives an outcome and never throws. The `Renderer` gets an optional second port, `input`, that can submit. With no `input`, each call gives the outcome `not-permitted` and sends nothing. The package also gives `stubViewTools`, so that a test of a view needs no hub.
- **The page attaches two subsystems on its one link**: the output subsystem `page-<hex>` and the input subsystem `page-<hex>-input`. The hexadecimal part is made one time for each load of the page, so that each input of one page has the same `source` in the record, also after the link ends and the page opens a new link. `connectHub` gives the two ports of each link to `onPorts`.
- **The title of the app bar is a control.** The designer selects the title, types a new title, and presses Enter. The view sends `store/set-field`, and the storage subsystem writes `state.json`. The app bar shows the states "edit", "saving", and "not saved" with the reason. The style guide and its screenshot tests show each state.
- **Three new field types**: `number`, `boolean`, and `reference`. A reference holds the ID of an entity of the same model. The validation refuses a value of the wrong type, a number that is not finite, and a reference to an entity that does not exist. Thus the store refuses `remove-entity` for an entity that a different entity refers to.
- **The generated prop types** follow the new types: `number`, `boolean`, and a picture (`ReactNode`) for a reference. Each generated file also exports the type `Values` that `wishem.setField` takes, and `Props` has the member `wishem`. The label names `wishem` and `key` are reserved: the generator reports an error, and the renderer gives a warning.
- **Nested views.** The prop of a reference field is the picture of the entity that the field names: each of its components that has a view, in the same marked elements. An entity that a reference field of a drawn component names is drawn only where its holder puts it, and not at the top level. A cycle of references draws each entity one time on its path and gives one warning.
- The architecture document shows the new relationship of the model folder (a field value refers to an entity) and the renderer that sends inputs. The glossary and the concepts describe the reference field and the reserved prop.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wishem/core/model`: the field types `number`, `boolean`, and `reference`, and their rules for values.
- `wishem/core/store`: `remove-entity` and `set-field` with references, and the comparison of values in `set-field`.
- `wishem/renderer-html/renderer`: the renderer sends the inputs of its views through an input port, and draws held entities in the place of their holder.
- `wishem/renderer-html/views`: the reserved prop `wishem`, its outcomes, the test of a view with no hub, and the prop of a reference field.
- `wishem/renderer-html/view-types`: the types of the new fields, the type `Values`, the member `wishem`, and the reserved names.
- `wishem/renderer-html/page`: the page attaches an output subsystem and an input subsystem, and the source of its inputs is the same for one load of the page.
- `wishem/design-system/component-catalog`: the app bar with a title that the designer can change, and its states.
- `wishem/architecture/diagrams`: the entity diagram shows the relationship from a field value to an entity, and the component diagram of the page shows that the renderer sends inputs.

## Impact

- `nodejs/wishem/core`: `model.ts`, `validate-model.ts`, `store.ts`, their tests, and the README.
- `nodejs/wishem/renderer-react`: `Renderer.tsx`, `collect-views.ts`, `field-names.ts`, `view-warnings.ts`, `view-types.ts`, a new `view-tools.ts`, `index.ts`, their tests, and the README.
- `nodejs/wishem/workbench-app`: `src/hub-client.ts`, `src/main.tsx`, `src/Page.tsx`, `src/components/AppBar.tsx`, `src/views/AppBar.tsx`, `src/views/AppBar.view.gen.ts`, a new `src/views/outcome-text.ts`, the style guide, the screenshot baselines, the Playwright tests, and the README.
- Documents: `nodejs/wishem/docs/architecture/` (README, `render.mjs`, the SVG files of the entity diagram and of the component diagram of the page), `glossary.md`, and `concepts.md`.
- No change to the link protocol, the hub, `host-nodejs`, `clock`, or `workbench`.
- Not in this change: the panel that lists the entities of the product and its form (#537), a list of references, a field that a person can clear, and a control for undo.
