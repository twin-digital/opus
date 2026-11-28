# @thrashplay/wishem-sample-product

## 0.1.0

### Minor Changes

- 139b3cd: New private package: the sample product, with a model of a color and a count, and a rule that adds 1 to the count at each tick.
- d823333: Export `wrapStore`, the rules of the product for a product construct.
- 421d784: React views for the color and the count: `ClearColor` and `Count`.
- f90da5b: New exports `colorBehavior` and `COLORS`. A product construct with the sample product changes its color at each tick.
- 9708c13: The count of the sample product is a number. The count rule adds 1 to each count that is a number.
- cb53122: Add the subpath export `color-cases` with `COLOR_CASES` and `FALLBACK_COLOR`. `COLOR_CASES` is the table of values that are colors and values that are not. `FALLBACK_COLOR` is `#ff00ff`.
- d04cdf9: The sample product exports `countBehavior` and the list `behaviors` in place of `withCountRule` and `wrapStore`.

### Patch Changes

- 7328c0a: Add tests for the count behavior and the root entry of the sample product.
- 532c324: Test that the color behavior keeps each field that is not the color.
- cf2c8d6: Test of the table `COLOR_CASES` checks each case of the design, with the type of its value.
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
- Updated dependencies [214862c]
- Updated dependencies [f70b6b9]
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
- Updated dependencies [511b905]
- Updated dependencies [d04cdf9]
  - @thrashplay/wishem-hub@0.1.0
  - @thrashplay/wishem-core@0.1.0
  - @thrashplay/wishem-update@0.1.0
