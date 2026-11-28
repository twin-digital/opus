# @thrashplay/wishem-renderer-react

## 0.1.0

### Minor Changes

- 5ea9a44: Each view gets the reserved prop `wishem` with `setField` and `submit`. The renderer gets the optional port `input`, draws nested views for reference fields, and writes types that follow the type of each field.
- 23535f3: Export `sendInput`, which sends one input message through the input port of a renderer.
- 214862c: Hold the entities of a `reference-list` field and give the view a list of pictures.
- 214862c: Write the types of a `reference-list` field in the generated view types.
- 838a454: New package: the React renderer of Wishem. It draws the React views of a model.
- 838a454: The `Renderer` component draws from a port of the hub and draws again when the part `store` changes.
- 838a454: The entry `./view-types` generates the types of the props of each React view. The option `command` gives the command that the header of a generated file names.

### Patch Changes

- de06ddc: A field whose label gives an empty name gives no prop. `viewWarnings` reports it with the kind `empty-name`.
- dacd357: Add a test for the keys of the pictures in a reference list.
- 0f1c57d: Make the tests of `renderer-react` and `workbench-app` check the parts of a message that matter, fix two documents, and list the resolve conditions of the tests of `renderer-react` in full.
- 45ec052: The tests of the renderer, the table of views, the names of the props, the warnings, and the generated types are stronger. The package has no change of behavior.
- 9dacfe6: The tests of the view inputs and of the nested views are stronger. The package has no change of behavior.
- 5e4ecc0: The tests of the field names and of the view warnings are stronger. The package has no change of behavior.
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
