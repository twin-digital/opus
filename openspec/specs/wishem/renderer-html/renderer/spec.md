# wishem/renderer-html/renderer Specification

## Purpose

Defines the React renderer package: what it draws from the joined state that it reads through a port, how the picture follows the part `store`, how each drawn element gives its entity, and what the renderer leaves to the page that uses it.

## Requirements

### Requirement: The React renderer is a package

The React renderer SHALL be the private package `@thrashplay/wishem-renderer-react` in `nodejs/wishem/renderer-react`. Its root entry SHALL use no Node.js API, so that it runs in a web browser. The root entry SHALL NOT know the address of a hub, a link, a folder of views, or the workbench. The generator of the prop types SHALL be the separate entry `@thrashplay/wishem-renderer-react/view-types`.

#### Scenario: The workbench page uses the package

- **WHEN** the page of the workbench draws the base workbench
- **THEN** the page imports the renderer and the table of views from `@thrashplay/wishem-renderer-react`, and it shows the app bar with the title `Wishem`

#### Scenario: A module of the root entry imports a Node.js module

- **WHEN** a source file of the package, other than the generator and the tests, imports a `node:` module
- **THEN** the lint of the package fails

### Requirement: The renderer reads the joined state through a port

The renderer SHALL get a port and SHALL read the joined state only through its `read` and `subscribe` operations. A direct port of a hub in the same process and a remote port of a link SHALL give the same picture for the same joined state.

#### Scenario: A direct port

- **WHEN** a hub with the store holds one entity with an `AppBar` component whose title is `Wishem`, and the renderer gets a port of that hub
- **THEN** the renderer draws one app bar with the title `Wishem`

#### Scenario: A remote port

- **WHEN** the same hub serves a link, and the renderer gets the remote port of an output subsystem of that link
- **THEN** the renderer draws one app bar with the title `Wishem`

#### Scenario: A different port

- **WHEN** the renderer draws from one port, and then it gets a different port whose part `store` has the title `Hello`
- **THEN** the renderer draws the title `Hello`, it no longer listens to the first port, and the next event of the first port does not change the picture

### Requirement: The renderer draws each component that has a view

The renderer SHALL draw at the top level one picture for each component, of each entity in the part `store` that is not held, whose component type has a view in the table of views. The order SHALL be the order of the entities, and for one entity the order of the definitions. The renderer SHALL draw nothing for a component type that has no view, and this SHALL NOT be an error.

#### Scenario: Two entities

- **WHEN** the part `store` has two entities that each have an `AppBar` component
- **THEN** the renderer draws two app bars, in the order of the entities

#### Scenario: A joined state with no part store

- **WHEN** the joined state of the port has no part `store`
- **THEN** the renderer draws nothing and reports no error

#### Scenario: A held entity

- **WHEN** the entity `list` has a component with a view whose reference field names the entity `task`
- **THEN** the renderer draws `task` in the picture of `list` only, and not at the top level

### Requirement: The picture follows the part store

After each event of the port, the renderer SHALL read the part `store`. It SHALL draw again only when the part `store` is a different object. A rewind is an `applied` event, so the renderer SHALL need no other signal for it.

#### Scenario: An input that changes the store

- **WHEN** an input subsystem sends `store/set-field` that sets the title to `Hello`
- **THEN** the renderer draws the title `Hello`

#### Scenario: An input of a different model subsystem

- **WHEN** the hub applies an input after which the part `store` is the same object
- **THEN** no view is called again

#### Scenario: The link of a remote port ends

- **WHEN** the renderer draws from a remote port and the link ends
- **THEN** the renderer keeps the last picture

### Requirement: Each drawn element gives its entity

The renderer SHALL mark the picture of each component with the ID of its entity and the ID of its component type. The renderer SHALL add the mark. A view SHALL NOT need to add it. For each element in the picture of a component, a program SHALL be able to find the entity ID from the element.

#### Scenario: Find the entity of the app bar

- **WHEN** the page shows the app bar of the entity `e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2`
- **THEN** the heading of the app bar is in an element that is marked with that entity ID

#### Scenario: The mark does not change the layout

- **WHEN** the page draws the app bar with its mark
- **THEN** the app bar has the same size and position as the app bar of the style guide at the same width

### Requirement: The renderer sends an input only for a view

The renderer SHALL get an optional input port, which has the operation `submit`. It SHALL send an input through that port only when a view calls `wishem.setField` or `wishem.submit`. It SHALL send no input when it draws. It SHALL send each input one time, and SHALL NOT send an input again after its outcome.

#### Scenario: The record after the renderer draws

- **WHEN** the renderer draws from a direct port of a hub, and no view sends an input
- **THEN** the record of the hub holds no input

#### Scenario: A view sets a field

- **WHEN** the view of the app bar calls `wishem.setField('title', 'Hello')`, and the renderer has an input port of the subsystem `page-input`
- **THEN** the record holds one `store/set-field` input with the source `page-input`, the ID of the entity, the component type, and the field of the title, and the renderer draws `Hello`

#### Scenario: No input port

- **WHEN** the renderer has no input port, and a view calls `wishem.setField('title', 'Hello')`
- **THEN** the outcome is a rejection with the reason `not-permitted`, and the record holds no input

### Requirement: The renderer does not attach or close a port

The renderer SHALL attach no subsystem, and SHALL NOT close a port that it gets. The code that gives the ports attaches them and closes them. When the renderer is removed from the page, it SHALL remove each listener that it registered on the port.

#### Scenario: The renderer is removed

- **WHEN** the renderer is removed from the page
- **THEN** the port has no listener of the renderer and is still open, and a later event of the port causes no error

#### Scenario: A view sends an input after the renderer is removed

- **WHEN** a view keeps `wishem`, the renderer is removed, and the view calls `wishem.setField`
- **THEN** the input goes to the input port that the renderer had, and the outcome is the result of that port

### Requirement: A different input port

When the renderer gets a different input port, each later call of `wishem` SHALL use the new port. A call before the change SHALL keep the port of its time.

#### Scenario: A new link

- **WHEN** a view has an input that waits on the input port of a link, the link ends, and the renderer gets the input port of a new link
- **THEN** the outcome of the first input comes from the first port, and the next call of `wishem.setField` sends its input through the new port

### Requirement: A held entity is drawn in the place of its holder

An entity SHALL be held when a `reference` field or a `reference-list` field of a component of a different entity names it, and the component type of that component has a view. The renderer SHALL give the picture of a held entity to the view of its holder, and SHALL NOT draw the held entity at the top level. An entity that two holders name SHALL be drawn in the place of each holder.

#### Scenario: Two holders

- **WHEN** the entities `a` and `b` each have a component with a view whose reference field names `task`
- **THEN** the renderer draws `task` in the picture of `a` and in the picture of `b`, and each picture of `task` is in an element marked with the ID of `task`

#### Scenario: A reference field of a component type with no view

- **WHEN** the only reference that names `task` is in a component whose component type has no view
- **THEN** the renderer draws `task` at the top level

#### Scenario: The reference changes

- **WHEN** the renderer draws `task` in the picture of `list`, and an input sets the reference field of `list` to the entity `other`
- **THEN** the renderer draws `other` in the picture of `list`, and draws `task` at the top level

#### Scenario: The entities of a list are held

- **WHEN** a `reference-list` field of a component with a view of `deck` holds the IDs of `goat` and `owl`
- **THEN** the renderer draws `goat` and `owl` in the picture of `deck`, and does not draw them at the top level

#### Scenario: An entity leaves the list

- **WHEN** the renderer draws `goat` in the picture of `deck`, and the store applies `remove-reference` of `goat` from that list
- **THEN** the renderer draws `goat` at the top level, and not in the picture of `deck`

### Requirement: A cycle of references draws each entity one time on its path

When a held entity holds, through its own reference fields, an entity that is already on the path from the top level, the renderer SHALL draw nothing for that reference. The renderer SHALL give one warning in the browser console for each set of such cycles, by the rule of the other warnings of the views. An entity that holds itself SHALL count as a cycle.

#### Scenario: Two entities that hold each other

- **WHEN** the entity `root` holds `a`, `a` holds `b`, and `b` holds `a`
- **THEN** the renderer draws `root`, then `a` in `root`, then `b` in `a`, and nothing for the reference of `b`, and the browser console has one warning that names `b`, the field, and `a`

#### Scenario: A cycle with no entity at the top level

- **WHEN** the entities `a` and `b` hold each other, and no other entity holds them
- **THEN** the renderer draws neither of them, and the browser console has one warning
