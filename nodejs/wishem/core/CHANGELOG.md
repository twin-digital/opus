# @thrashplay/wishem-core

## 0.1.0

### Minor Changes

- 5ea9a44: Add the field types `number`, `boolean`, and `reference`. The store refuses `remove-entity` for an entity that a different entity refers to.
- 214862c: Make `isEqual` compare two JSON values of any kind, and make `set-field` keep the part for an equal list.
- 214862c: Add the store inputs `add-reference` and `remove-reference` for a `reference-list` field.
- 214862c: Add the field type `reference-list`, a list of entity IDs in order.
- f70b6b9: The store has the input `store/clear-field`, with `storeInputs().clearField` and the type `ClearFieldPayload`. The input removes the value of a field and keeps the component.
- df7c5ea: The input `add-entity` takes an optional `index` that sets the position of the new entity.
- 37070eb: Add `createStore`, a model subsystem for a hub that holds the definitions and the entities of a model and applies the inputs that change them.
- ecc7fc3: Export `isEqual`, the comparison of two models that the store uses.
- 274f162: New package: the Wishem core. It validates a model and serves its snapshot.
- 21aa38f: Export `CoreReader`, the read operations of a core (`getSnapshot` and `subscribe`).
- ecc7fc3: Remove `createCore`, `Core`, and `CoreReader`. The store holds the model.

### Patch Changes

- 46d64c9: A warning of a duplicate label has a path that ends at the label of the later definition.
- 51689f8: The problem text for a number that is not finite names the real value (NaN, Infinity) and not null.
- bb32932: The tests of `validateModel` check the text of the value in the message of a type mismatch.
- 19f055c: Test the order and the text of the warning of a duplicate label.
- dacd357: Add tests for the list validation and the list inputs.
- 0cba44c: The store does not freeze the array of the caller for a list of references.
- f92552b: Add a test for an empty list of references in `validateModel`.
- 046306c: Test the position of add-entity: a reference to an entity after the position, and an index that JSON cannot hold.
- 5888d4b: The tests of the field types and their messages are stronger. The package has no change of behavior.
- b655a01: Strengthen the tests of the store after a break-test with two passes. The package has no change of behavior.
- Updated dependencies [5ea9a44]
- Updated dependencies [d823333]
- Updated dependencies [ced6862]
- Updated dependencies [d107430]
- Updated dependencies [ea8b458]
- Updated dependencies [ea8b458]
- Updated dependencies [ea8b458]
- Updated dependencies [ea8b458]
- Updated dependencies [b36bb42]
- Updated dependencies [68b689d]
- Updated dependencies [3adc5a1]
- Updated dependencies [64efce8]
- Updated dependencies [a6b3ba2]
- Updated dependencies [96c1755]
- Updated dependencies [b19239f]
- Updated dependencies [52d739c]
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
