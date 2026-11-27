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

### Requirement: The renderer only reads

The renderer SHALL send no input, SHALL attach no subsystem, and SHALL NOT close the port that it gets. The code that gives the port attaches it and closes it. When the renderer is removed from the page, it SHALL remove each listener that it registered on the port.

#### Scenario: The record after the renderer draws

- **WHEN** the renderer draws from a direct port of a hub
- **THEN** the record of the hub holds no input that the renderer sent

#### Scenario: The renderer is removed

- **WHEN** the renderer is removed from the page
- **THEN** the port has no listener of the renderer and is still open, and a later event of the port causes no error

### Requirement: The renderer draws each component that has a view

The renderer SHALL draw one picture for each component, of each entity in the part `store`, whose component type has a view in the table of views. The order SHALL be the order of the entities, and for one entity the order of the definitions. The renderer SHALL draw nothing for a component type that has no view, and this SHALL NOT be an error.

#### Scenario: Two entities

- **WHEN** the part `store` has two entities that each have an `AppBar` component
- **THEN** the renderer draws two app bars, in the order of the entities

#### Scenario: A joined state with no part store

- **WHEN** the joined state of the port has no part `store`
- **THEN** the renderer draws nothing and reports no error

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
