---
issue: https://github.com/twin-digital/opus/issues/732
milestone: https://github.com/twin-digital/opus/milestone/11
---

# Proposal

## Why

The Godot renderer gives no warning for a field whose label gives no prop. `Views.props` in `renderer-godot/godot/wishem/views.gd` skips a label with an empty name and a second label with the same name, and it writes no message. The React renderer and the PixiJS renderer give a warning with the same text in each case, and also for a sidecar whose component type has no definition. A person who uses the Godot application thus does not learn why a view gets no prop or draws nothing. The review of the milestone A5 (issue #745, item M15) also found that the Godot specification does not say that an empty name gives no prop.

## What Changes

- The Godot renderer writes one warning with `push_warning` for each field of the component type of a view whose label gives an empty name. The text is the same as the text of the React renderer and of the PixiJS renderer.
- The Godot renderer writes one warning for each field whose label gives the same name as the label of an earlier field. The text is the same as the text of the other two renderers. The prop keeps the value of the first field, as now.
- The Godot renderer writes one warning for each view whose component type has no definition in the part `store`. The text is the same as the text of the other two renderers. The renderer continues to draw the other views.
- When the joined state has no part `store`, the renderer writes no warning.
- The renderer writes the warnings again only when their text changes. It sorts them as the other two renderers do: by sidecar, by component type, by name, and by kind.
- The renderer keeps the text of each warning that it wrote in `renderer.warnings`, as it keeps each error in `renderer.errors`.
- The specification "A view gets one prop for each field" says that a label with an empty name gives no prop.
- The Godot renderer gets no warning for a reserved name or for a cycle of references. It has no reserved props and no prop that holds a picture.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wishem/renderer-godot/renderer`: a view gets no prop for a label with an empty name, and the Godot renderer warns about a label that gives an empty name, about a sidecar whose component type has no definition, and about two labels that give the same name.

## Impact

- `nodejs/wishem/renderer-godot`: `godot/wishem/views.gd`, a new file `godot/wishem/view_warnings.gd`, `godot/wishem/renderer.gd`, their GDScript tests, `tests/godot.ui.test.ts`, `tests/sample-construct.ts`, and the README.
- No package, process, relationship, or import changes. The architecture document does not change.
- No change to `renderer-react`, `renderer-pixi`, `pixi-page`, `three-renderers`, `sample-product`, or the model.
