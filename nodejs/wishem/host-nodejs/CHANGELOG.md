# @thrashplay/wishem-host-nodejs

## 0.1.0

### Minor Changes

- 139b3cd: A construct can mount a product as a second store, and `wishem start` has the option `--product <folder>`.
- d823333: The option `subsystems` of `startConstruct` adds model subsystems after the stores.
- ced6862: `serveHub(hub, { port })` serves the link of a hub on a port of its own.
- 909ae54: Remove the bin `wishem` from the package, because the command is now in `@thrashplay/wishem-command`. This is a breaking change for a private package.
- 274f162: New package: the Node.js host of Wishem. The `wishem start` command serves the snapshot of a model folder over local HTTP.
- ecc7fc3: The server carries the link as a WebSocket at `/link` and refuses a connection from a page of a different site. `GET /snapshot` and `GET /snapshots` are removed.
- ecc7fc3: `startConstruct` replaces `startHost`: one Node.js process runs a construct, which is a hub with the store and the storage of the model folder.
- ecc7fc3: The process writes `state.json` of the model folder when the entities of the store change.

### Patch Changes

- 5ea9a44: The model folder accepts the field types `number`, `boolean`, and `reference`.
- f972a42: The process does not write `state.json` while the definitions of the store differ from the files in `definitions`. A model folder that the process writes always starts again.
- 214862c: Accept the field type `reference-list` and give its value to a view as a list of IDs.
- b36bb42: The link server refuses a binary WebSocket message and closes the connection.
- a9f747a: Ctrl+C on the `start` scripts of the workbench and of the workbench app ends with exit code 0. The scripts use `exec`, and the signal handlers stay in place for a second signal.
- 46d64c9: The terminal line of a model warning names the definition file of the duplicate label.
- 07144f1: The tests of the model folder storage now catch a change of the order of the definitions and a stop that happens during a read, and the package has no change of behavior.
- 05b6331: The tests of the model folder watch are stronger. The package has no change of behavior.
- 28aa975: The tests of the check of the model folder before a write are stronger. The package has no change of behavior.
- 99dfd5c: The tests of the mount of a product are stronger. The package has no change of behavior.
- 343bf6e: A test of `serveHub` has a name that says what it checks. The package has no change of behavior.
- c05d7b6: The tests of the option `subsystems` of `startConstruct` are stronger. The package has no change of behavior.
- e540990: The process follows a hand edit of `state.json` after it writes the file.
- 86b2e37: The writer of `state.json` does no comparison for an input that does not change the store.
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
