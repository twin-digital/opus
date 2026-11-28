---
issue: https://github.com/twin-digital/opus/issues/657
milestone: https://github.com/twin-digital/opus/milestone/17
---

# Proposal

## Why

The label of a field can give an empty name, for example the label `???`. The React renderer then gives the view the prop `""` and no warning. The generator of the types of the props refuses the same field with an error, and the Godot renderer gives no prop. The renderers and the generator do not agree, and the specifications do not say which behavior is correct. The break-test #638 found this fault.

## What Changes

- A field whose label gives an empty name gives no prop to its view. This is the rule for a field whose label gives a reserved name.
- The React renderer gives a warning in the browser console for each field whose label gives an empty name. The warning names the sidecar file, the field ID, and the component type ID. The page continues to draw.
- The generator does not change. It reports an error for an empty name and writes no file for that sidecar. The specification `wishem/renderer-html/view-types` gets a scenario for this case.
- `setField` of the tools of a view gives `invalid` for the name `""`, because no prop has that name.
- The Godot renderer does not change. It gives no prop for such a field already. It gives no warning. The parity of the messages of the three renderers stays with #542.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wishem/renderer-html/views`: a view gets no prop for a field whose label gives an empty name or a reserved name, and the page warns about a label that gives an empty name.
- `wishem/renderer-html/view-types`: the requirement for a label that gives no usable name gets a scenario for an empty name.

## Impact

- `nodejs/wishem/renderer-react`: `propNames` in `src/field-names.ts`, `viewWarnings` and `describeWarning` in `src/view-warnings.ts`, their tests, the tests of `Renderer.tsx`, and the README.
- The exported type `ViewWarning` gets the kind `empty-name`. The package is private.
- No change to `renderer-godot`, `renderer-pixi`, `workbench-app`, or the model.
