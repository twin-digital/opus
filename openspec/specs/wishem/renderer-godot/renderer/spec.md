# wishem/renderer-godot/renderer Specification

## Purpose

Defines the Godot renderer: how it draws Godot views from a port, how a Godot view and its sidecar attach to a component type, the props of a view, the `ClearColor` view, the entity at a point, and the stop.

## Requirements

### Requirement: The renderer reads only through the port

The renderer SHALL read the joined state through `read` and get the events through `subscribe` of the port that it gets. It SHALL send no input and SHALL NOT close the port. It SHALL draw at once from `read()`, and again after each event when the part `store` is a different object.

#### Scenario: A field changes

- **WHEN** the renderer draws an entity and the port gives an `applied` event with a new part `store` in which a field of that entity changed
- **THEN** the node of that component has the new value, and the record of the hub holds no input of the renderer

#### Scenario: An event that leaves the part store the same

- **WHEN** the port gives an `applied` event and the part `store` is the same object
- **THEN** the renderer calls no view

### Requirement: A Godot view is attached by a sidecar

A Godot view SHALL be a GDScript file `<name>.gd` with the functions `create()` and `update(node, props, viewport)`. Its sidecar `<name>.view.json` SHALL hold `{ "kind": "godot", "componentType": "<ID>" }`. The renderer SHALL draw each component whose component type has a view, with one node for each component, and SHALL draw no component of a type with no view.

#### Scenario: A component type with a view

- **WHEN** the folder of views holds `ClearColor.gd` and `ClearColor.view.json` with the ID of the component type `Clear color`, and the store holds one entity with that component
- **THEN** the renderer makes one node for that component

#### Scenario: A sidecar of a different kind

- **WHEN** the folder of views holds a sidecar with the kind `pixi`
- **THEN** the renderer ignores that sidecar

### Requirement: A Godot sidecar that is not correct is an error

The renderer SHALL report an error that names the file and SHALL draw no view for a sidecar that is not JSON, that has no text `componentType`, whose view file is missing, or whose view has no `create` or no `update`. It SHALL report an error for two sidecars with one component type.

#### Scenario: A view file is missing

- **WHEN** the folder holds `Box.view.json` and no `Box.gd`
- **THEN** the renderer reports an error that names `Box.view.json`, and draws the other views

### Requirement: A view gets one prop for each field

The renderer SHALL give a view one prop for each field of the definition of its component type, except a field whose label gives an empty name, with the name of the rule of `wishem/renderer-html/view-types`. A field with no value SHALL give no prop. For two fields with one name, the first field SHALL give the value.

#### Scenario: A label of two words

- **WHEN** a field has the label `Max health` and the value `10`
- **THEN** the view gets the prop `maxHealth` with the value `10`

#### Scenario: A label that gives an empty name

- **WHEN** a component type has the fields `???` and `title`, and the component holds a value in each field
- **THEN** the view gets the prop `title`, and it gets no other prop

#### Scenario: A label that starts with a digit

- **WHEN** the label of a field is `2nd line`
- **THEN** the view gets the prop `2ndLine`, and the renderer gives no warning for it

### Requirement: The renderer orders and removes nodes

The renderer SHALL put the nodes in the order of the entities, and then in the order of the definitions. It SHALL make a node for a new component, and SHALL remove and free the node of a component that is gone. It SHALL call `update` with the size of the viewport at each update.

#### Scenario: An entity is removed

- **WHEN** the store removes an entity that the renderer draws
- **THEN** its node leaves the tree and is freed

### Requirement: The ClearColor view fills the viewport

The view `ClearColor` SHALL make one rectangle node that covers the full viewport, with the color of the prop `color`, as the requirement "A color of the sample construct is #rrggbb" of `wishem/renderers/sample-construct` gives it. When the prop has no value or is not a color, the node SHALL have the fallback color `#ff00ff`. The node SHALL stay visible.

#### Scenario: A color

- **WHEN** the prop `color` is `#b91c1c` and the viewport is 640 by 360 pixels
- **THEN** the node is visible, covers 640 by 360 pixels, and has the color `#b91c1c`

#### Scenario: A value that is not a color

- **WHEN** the prop `color` is `not a color`
- **THEN** the node is visible, covers the viewport, and has the color `#ff00ff`

#### Scenario: No value

- **WHEN** the props have no `color`
- **THEN** the node is visible and has the color `#ff00ff`

#### Scenario: A color that Godot reads and the rule refuses

- **WHEN** the prop `color` is `1d4ed8` or `#1d4ed880`
- **THEN** the node has the color `#ff00ff`, with an alpha of 1

### Requirement: The renderer gives the entity at a point

The renderer SHALL give the entity and the component type of the top visible node whose rectangle holds a point of the viewport, and no value when no visible node holds the point.

#### Scenario: A point on the clear color

- **WHEN** the renderer draws one `ClearColor` component and code asks for the point 10, 10
- **THEN** the renderer gives the ID of the entity and the ID of the component type `Clear color`

### Requirement: The renderer can stop

When the renderer stops, it SHALL remove its listener from the port and free its nodes. It SHALL NOT close the port. A second stop SHALL do nothing.

#### Scenario: An event after the stop

- **WHEN** the renderer stopped and the port gives an `applied` event
- **THEN** no view is called and no error occurs

### Requirement: The Godot renderer warns about a label that gives an empty name

For each view in the table of views whose component type has a field whose label gives an empty name, the renderer SHALL write one warning to the output of Godot for that field, and SHALL continue to draw. The warning SHALL name the sidecar file, the field ID, and the component type ID, with the same text as the warning of the React renderer. The renderer SHALL write the warnings again only when their text changes.

#### Scenario: A label with no letter or digit

- **WHEN** the `Color` component type has a field with the label `???`, and the sidecar `ClearColor.view.json` names that component type
- **THEN** the output of Godot has one warning that names `ClearColor.view.json`, the field ID, and the component type ID, and the view draws with the prop `color`

#### Scenario: Two labels that give an empty name

- **WHEN** a component type has the fields `???` and `--`, and a sidecar names that component type
- **THEN** the output of Godot has one warning for each of the two fields, in the order of the fields, and no other warning

#### Scenario: An input that leaves the definitions as they were

- **WHEN** the renderer wrote the warning for a field with the label `???`, and an input then changes the value of a different field
- **THEN** the output of Godot gets no new warning

#### Scenario: A component type with no component

- **WHEN** a sidecar names a component type with a field whose label is `???`, and no entity has a component of that type
- **THEN** the output of Godot has one warning for that field

### Requirement: The Godot renderer warns about a sidecar whose component type has no definition

For each view in the table of views whose component type has no definition in the part `store`, the renderer SHALL write one warning to the output of Godot, and SHALL continue to draw the other views. The warning SHALL name the sidecar file and the component type ID, with the same text as the warning of the React renderer. When the joined state has no part `store`, the renderer SHALL write no warning.

#### Scenario: A sidecar for a component type that is not defined

- **WHEN** the sidecar `ClearColor.view.json` names a component type ID that no definition of the part `store` has
- **THEN** the output of Godot has one warning that names `ClearColor.view.json` and the ID, and the renderer draws the other views

#### Scenario: The definition is added

- **WHEN** the renderer wrote the warning for a sidecar whose component type has no definition, and an input then adds the definition of that component type
- **THEN** the output of Godot gets no new warning, and the renderer draws the components of that type

#### Scenario: An input that leaves the definitions as they were

- **WHEN** the renderer wrote the warning for a sidecar whose component type has no definition, and an input then changes the value of a field
- **THEN** the output of Godot gets no new warning

#### Scenario: A joined state with no part store

- **WHEN** the joined state of the port has no part `store`, and the table of views has a view
- **THEN** the output of Godot gets no warning from the renderer

### Requirement: The Godot renderer warns about two labels that give the same name

For each field of the component type of a view whose label gives the same name as the label of an earlier field, the renderer SHALL write one warning to the output of Godot, and SHALL continue to draw. The warning SHALL name the sidecar file, the ID of the earlier field and of the later field, the component type ID, and the name, with the same text as the warning of the React renderer. The prop SHALL have the value of the first field.

#### Scenario: Two labels that give the same name

- **WHEN** a component type has the fields `Max health` and `max-health`, and a sidecar names that component type
- **THEN** the output of Godot has one warning that names the sidecar file, the two field IDs, the component type ID, and the name `maxHealth`, and the view gets the prop `maxHealth` with the value of the field `Max health`

#### Scenario: Three labels that give the same name

- **WHEN** a component type has the fields `Color`, `color`, and `color!`, and a sidecar names that component type
- **THEN** the output of Godot has two warnings: one for the first and the second field, and one for the first and the third field

#### Scenario: An empty name and the same name in one component type

- **WHEN** a component type has the fields `???`, `Max health`, and `max-health`, and a sidecar names that component type
- **THEN** the output of Godot has the warning for the empty name first, and then the warning for the same name

#### Scenario: A new link of the application

- **WHEN** the Godot application wrote the warning for two labels that give the same name, the construct stops, and the application connects to the construct again
- **THEN** the output of Godot has the warning one more time, after the line `wishem-godot: connected (link 2)`
