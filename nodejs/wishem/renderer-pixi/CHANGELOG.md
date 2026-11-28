# @thrashplay/wishem-renderer-pixi

## 0.1.0

### Minor Changes

- ced6862: New private package: the PixiJS renderer, which draws the PixiJS views of the components of a port of the hub on a PixiJS stage.

### Patch Changes

- 214862c: Accept the field type `reference-list` and give its value to a view as a list of IDs.
- fa9b43c: A field whose label gives an empty name gives no prop.
- fa9b43c: The renderer writes one warning with `console.warn` for each field whose label gives an empty name.
- 3b8b801: The renderer gives one warning for each field whose label gives the same name as an earlier field.
- 3b8b801: The renderer gives one warning for a view whose sidecar names a component type that has no definition.
- 72c64c2: The tests are stronger. The behavior does not change.
- 60c13b1: Keep the object hidden when its view hides it on the update after a failed update.
- dbd9333: Test the sort of an empty-name warning before a same-name warning.
- 76f7321: Add tests for the visibility of an object after a failure of its view.
- 4cbfd1c: The tests of the renderer and of the prop names are stronger. The package has no change of behavior.
- Updated dependencies [5ea9a44]
- Updated dependencies [5ea9a44]
- Updated dependencies [d823333]
- Updated dependencies [ced6862]
- Updated dependencies [d107430]
- Updated dependencies [ea8b458]
- Updated dependencies [ea8b458]
- Updated dependencies [ea8b458]
- Updated dependencies [ea8b458]
- Updated dependencies [214862c]
- Updated dependencies [214862c]
- Updated dependencies [214862c]
- Updated dependencies [f70b6b9]
- Updated dependencies [b36bb42]
- Updated dependencies [df7c5ea]
- Updated dependencies [46d64c9]
- Updated dependencies [68b689d]
- Updated dependencies [3adc5a1]
- Updated dependencies [64efce8]
- Updated dependencies [51689f8]
- Updated dependencies [a6b3ba2]
- Updated dependencies [bb32932]
- Updated dependencies [19f055c]
- Updated dependencies [96c1755]
- Updated dependencies [b19239f]
- Updated dependencies [dacd357]
- Updated dependencies [0cba44c]
- Updated dependencies [f92552b]
- Updated dependencies [046306c]
- Updated dependencies [52d739c]
- Updated dependencies [37070eb]
- Updated dependencies [5888d4b]
- Updated dependencies [ecc7fc3]
- Updated dependencies [274f162]
- Updated dependencies [21aa38f]
- Updated dependencies [ecc7fc3]
- Updated dependencies [b655a01]
- Updated dependencies [b7d80d7]
- Updated dependencies [24b02f3]
- Updated dependencies [cbbd4e9]
- Updated dependencies [24fbcff]
- Updated dependencies [3197928]
- Updated dependencies [86b2e37]
- Updated dependencies [86b2e37]
- Updated dependencies [86b2e37]
- Updated dependencies [86b2e37]
- Updated dependencies [86b2e37]
- Updated dependencies [b655a01]
  - @thrashplay/wishem-hub@0.1.0
  - @thrashplay/wishem-core@0.1.0
