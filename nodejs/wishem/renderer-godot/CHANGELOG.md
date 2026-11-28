# @thrashplay/wishem-renderer-godot

## 0.1.0

### Minor Changes

- d107430: Add the Godot renderer: a Godot application that reaches a hub through the link with a GDScript client, draws the `ClearColor` view, runs in a Docker container, and has the commands `start`, `godot`, and `test:godot`.
- f90da5b: The package does not start a construct. The script `start` and the export `startGodotConstruct` are removed. The default hub port is 4750.

### Patch Changes

- f90da5b: `runGodot` removes only the old containers that have the same shot folder. Two runs with different shot folders no longer remove the container of each other.
- 214862c: Accept the field type `reference-list` and give its value to a view as a list of IDs.
- 68b689d: The reference client and the GDScript client close the link for malformed messages. `LINK.md` states the rules.
- 9410938: The Godot renderer writes a warning for a label that gives an empty name.
- 9410938: The Godot renderer writes a warning for two labels that give the same name.
- 9410938: The Godot renderer writes a warning for a sidecar whose component type has no definition.
- 7a52830: Close the link when the hub sends a `result` that the contract of the link calls malformed.
- cb53122: The `ClearColor` view fills the viewport with `#ff00ff` when the color is missing or is not `#rrggbb`. The React page, the PixiJS page, and the Godot application draw the same picture.
- e3c70bf: The check for a left Godot container counts only the containers of its own test.
