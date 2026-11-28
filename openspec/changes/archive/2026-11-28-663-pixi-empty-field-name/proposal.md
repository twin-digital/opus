---
issue: https://github.com/twin-digital/opus/issues/663
milestone: https://github.com/twin-digital/opus/milestone/19
---

# Proposal

## Why

The label of a field can give an empty name, for example the label `???`. The PixiJS renderer then gives the view the prop `""` and no warning. The React renderer gives no prop and a warning `empty-name` for the same field (the archived change `2026-11-28-657-empty-field-name`). The two renderers do not agree.

## What Changes

- A field whose label gives an empty name gives no prop to its PixiJS view. This is the rule of the React renderer.
- The PixiJS renderer gives one warning in the browser console for each such field of each view in the table of views. The line is the same as the line of the React renderer. It names the sidecar file, the field ID, and the component type ID. The renderer continues to draw.
- The renderer gives the warnings again only when the lines change.
- A name that starts with a digit keeps its prop and gives no warning, as in the React renderer.
- The PixiJS renderer gets no other warning (a reserved name, the same name, a component type with no definition). These are not in the scope of #663.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wishem/renderer-pixi/renderer`: a PixiJS view gets no prop for a field whose label gives an empty name, and the renderer warns about such a label.

## Impact

- `nodejs/wishem/renderer-pixi`: `propNames` in `src/field-names.ts`, a new internal module `src/view-warnings.ts`, `startRenderer` in `src/renderer.ts`, their tests, and the README.
- The exports of the package do not change.
- No change to `pixi-page`, `renderer-react`, `renderer-godot`, or the model. The views of `pixi-page` have no field with an empty name.
