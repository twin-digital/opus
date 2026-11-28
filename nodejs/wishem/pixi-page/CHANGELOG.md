# @thrashplay/wishem-pixi-page

## 0.1.0

### Minor Changes

- ced6862: New private package: the PixiJS page and its construct in a Node.js process, started together by one `start` command.
- f90da5b: The package does not start a construct and has no `--paused` option. The option `--hub-port` names the construct to draw. The default port is 4750.

### Patch Changes

- 5ea9a44: The page keeps the same subsystem IDs when its link connects again.
- 23a7fd2: The PixiJS page server prints one short line when no construct answers the link. It prints no Vite stack trace at each retry. A reset of the link by the browser prints nothing. A plain HTTP request to `/link` gets status 502.
- cb53122: The `ClearColor` view fills the viewport with `#ff00ff` when the color is missing or is not `#rrggbb`. The React page, the PixiJS page, and the Godot application draw the same picture.
- b18ab9a: The PixiJS page now reloads when the browser restores it from the back/forward cache.
- 6518718: The test of the start script waits for the line of the hub port before it reads the output.
- d04cdf9: The PixiJS construct runs its color behavior in the update subsystem.
- Updated dependencies [5ea9a44]
- Updated dependencies [5ea9a44]
- Updated dependencies [139b3cd]
- Updated dependencies [139b3cd]
- Updated dependencies [d823333]
- Updated dependencies [421d784]
- Updated dependencies [ced6862]
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
- Updated dependencies [b36bb42]
- Updated dependencies [58e0189]
- Updated dependencies [df7c5ea]
- Updated dependencies [46d64c9]
- Updated dependencies [68b689d]
- Updated dependencies [3adc5a1]
- Updated dependencies [fa9b43c]
- Updated dependencies [fa9b43c]
- Updated dependencies [64efce8]
- Updated dependencies [51689f8]
- Updated dependencies [a6b3ba2]
- Updated dependencies [3b8b801]
- Updated dependencies [3b8b801]
- Updated dependencies [72c64c2]
- Updated dependencies [bb32932]
- Updated dependencies [19f055c]
- Updated dependencies [96c1755]
- Updated dependencies [60c13b1]
- Updated dependencies [b19239f]
- Updated dependencies [dbd9333]
- Updated dependencies [2562f8e]
- Updated dependencies [76f7321]
- Updated dependencies [dacd357]
- Updated dependencies [0cba44c]
- Updated dependencies [f92552b]
- Updated dependencies [046306c]
- Updated dependencies [73432e7]
- Updated dependencies [52d739c]
- Updated dependencies [37070eb]
- Updated dependencies [fcf369e]
- Updated dependencies [bdbc697]
- Updated dependencies [86b2e37]
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
- Updated dependencies [4cbfd1c]
  - @thrashplay/wishem-hub@0.1.0
  - @thrashplay/wishem-core@0.1.0
  - @thrashplay/wishem-clock@0.1.0
  - @thrashplay/wishem-renderer-pixi@0.1.0
