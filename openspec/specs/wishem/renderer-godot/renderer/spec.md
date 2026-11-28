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

The renderer SHALL give a view one prop for each field of the definition of its component type, with the name of the rule of `wishem/renderer-html/view-types`. A field with no value SHALL give no prop. For two fields with one name, the first field SHALL give the value.

#### Scenario: A label of two words

- **WHEN** a field has the label `Max health` and the value `10`
- **THEN** the view gets the prop `maxHealth` with the value `10`

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
