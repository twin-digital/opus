---
issue: https://github.com/twin-digital/opus/issues/708
milestone: https://github.com/twin-digital/opus/milestone/11
---

# Proposal

## Why

The PixiJS renderer gives a warning only for a field whose label gives an empty name (the archived change `2026-11-28-663-pixi-empty-field-name`). The React renderer also gives a warning for two labels that give the same name, and for a sidecar of a component type that has no definition. The PixiJS renderer gives neither warning, so a person who uses the PixiJS renderer does not learn why a view draws nothing or why a field gives no prop.

## What Changes

- The PixiJS renderer gives one warning in the browser console for each sidecar in the table of views whose component type has no definition. The line is the same as the line of the React renderer. It names the sidecar file and the component type ID. The renderer continues to draw the other views.
- The PixiJS renderer gives one warning for each pair of fields of one component type whose labels give the same name. The line is the same as the line of the React renderer. It names the sidecar file, the two field IDs, the component type ID, and the name. The prop keeps the value of the first field.
- When the joined state has no part `store`, the renderer gives no warning, as the React renderer does.
- The renderer sorts the warnings as the React renderer does: by sidecar, by component type, by name, and by kind.
- The two renderers keep their own copies of the rule of the names and of the lines. This change adds no shared module (design.md, decision 1).
- The PixiJS renderer gets no warning for a reserved name or for a cycle of references. It has no reserved props and no prop that holds a picture.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wishem/renderer-pixi/renderer`: the PixiJS renderer warns about a sidecar whose component type has no definition and about two labels that give the same name, and it gives no warning for a joined state with no part `store`.

## Impact

- `nodejs/wishem/renderer-pixi`: `src/view-warnings.ts`, `startRenderer` in `src/renderer.ts`, their tests, and the README.
- The exports of the package do not change. No package, import, or relationship changes, so the architecture document does not change.
- No change to `renderer-react`, `pixi-page`, `renderer-godot`, or the model.
