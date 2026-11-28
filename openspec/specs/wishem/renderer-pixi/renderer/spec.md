# wishem/renderer-pixi/renderer Specification

## Purpose

Defines the PixiJS renderer package: how it draws PixiJS views from the joined state that it reads through a port, how a view attaches to its component type, which display objects it keeps, and what it leaves to the page that uses it.

## Requirements

### Requirement: The PixiJS renderer is a package

The PixiJS renderer SHALL be the private package `@thrashplay/wishem-renderer-pixi` in `nodejs/wishem/renderer-pixi`. It SHALL use no Node.js API, so that it runs in a web browser. It SHALL NOT know the address of a hub, a link, a folder of views, or a clock. The page SHALL give it the port, the table of views, the PixiJS container to draw in, and the size of the viewport.

#### Scenario: A source file imports a Node.js module

- **WHEN** a source file of the package, other than a test file, imports a `node:` module
- **THEN** the lint of the package fails

#### Scenario: The renderer runs with no window

- **WHEN** a test in Node.js, with no web browser and no graphics card, starts the renderer on a PixiJS container
- **THEN** the renderer adds the display objects of the views to the container

### Requirement: The renderer reads the joined state through a port

The renderer SHALL read the joined state only through the `read` and `subscribe` operations of the port that it gets. A direct port of a hub in the same process and a remote port of a link SHALL give the same display objects for the same joined state.

#### Scenario: A direct port

- **WHEN** a hub with the store holds one entity with a `Clear color` component whose color is `#1d4ed8`, and the renderer starts with a port of that hub
- **THEN** the container holds one display object of the `ClearColor` view, with the color `#1d4ed8`

#### Scenario: A remote port

- **WHEN** the same hub serves a link, and the renderer starts with the remote port of an output subsystem of that link
- **THEN** the container holds the same display object with the same color

### Requirement: The renderer only reads

The renderer SHALL send no input, SHALL attach no subsystem, and SHALL NOT close the port. The code that gives the port attaches it and closes it.

#### Scenario: The record after the renderer draws

- **WHEN** the renderer draws from a direct port of a hub, and the hub applies inputs from a different subsystem
- **THEN** the record of the hub holds no input that the renderer sent

### Requirement: The renderer draws each component that has a view

The renderer SHALL keep one display object for each component, of each entity in the part `store`, whose component type has a view in the table of views. The order of the display objects in the container SHALL be the order of the entities, and for one entity the order of the definitions. A later display object SHALL be drawn over an earlier one. The renderer SHALL draw nothing for a component type that has no view, and this SHALL NOT be an error.

#### Scenario: Two entities

- **WHEN** the part `store` has two entities that each have a `Clear color` component
- **THEN** the container holds two display objects, and the object of the second entity is after the object of the first entity

#### Scenario: A component type with no view

- **WHEN** an entity has a component whose type has no view
- **THEN** the renderer adds no display object for it and reports no error

#### Scenario: A joined state with no part store

- **WHEN** the joined state of the port has no part `store`
- **THEN** the container holds no display object of the renderer, and the renderer reports no error

### Requirement: The display objects follow the part store

After each event of the port, the renderer SHALL read the part `store`. When the part is a different object, the renderer SHALL make a display object for each new component, SHALL set each display object again from its props, and SHALL remove and destroy the display object of each component that is gone. When the part is the same object, the renderer SHALL change nothing. A rewind is an `applied` event, so the renderer SHALL need no other signal for it.

#### Scenario: An input that changes the color

- **WHEN** an input subsystem sends `store/set-field` that sets the color to `#b91c1c`
- **THEN** the display object of the component has the color `#b91c1c`, and it is the same object as before

#### Scenario: An input of a different model subsystem

- **WHEN** the hub applies an input after which the part `store` is the same object
- **THEN** the renderer does not set a display object again

#### Scenario: An entity is removed

- **WHEN** an input removes an entity that has a `Clear color` component
- **THEN** the container no longer holds its display object, and that object is destroyed

#### Scenario: The link of a remote port ends

- **WHEN** the renderer draws from a remote port and the link ends
- **THEN** the display objects stay as they were

### Requirement: A PixiJS view is attached by a sidecar

A PixiJS view SHALL be a module whose default export makes one display object and sets that object from its props and the size of the viewport. The sidecar of the view file `<name>.ts` SHALL be `<name>.view.json`, with `kind` `pixi` and `componentType`, the ID of one component type. The renderer SHALL ignore a sidecar of a different kind.

#### Scenario: The sidecar of the clear-color view

- **WHEN** the views of a page have `ClearColor.ts` and `ClearColor.view.json` with the kind `pixi` and the ID of the `Clear color` component type
- **THEN** the table of views has the `ClearColor` view for that component type

#### Scenario: A sidecar of the kind react

- **WHEN** the views of a page have a sidecar with the kind `react`
- **THEN** the table of views does not use it, and no error occurs

### Requirement: A PixiJS sidecar that is not correct is an error

A sidecar that is not a JSON object with a `kind` and a `componentType` that are text, a sidecar of the kind `pixi` with no view file, a view file whose default export is not a view, and two sidecars of the kind `pixi` for one component type SHALL each give one error that names the sidecar files. After such an error, the table of views SHALL NOT be made.

#### Scenario: A sidecar with no view file

- **WHEN** the views of a page have `Header.view.json` with the kind `pixi` and no `Header.ts`
- **THEN** the table of views is not made, and the error names `Header.view.json`

#### Scenario: Two sidecars for one component type

- **WHEN** two sidecars of the kind `pixi` name the same component type
- **THEN** the table of views is not made, and the error names the two sidecar files

### Requirement: A PixiJS view gets the fields of its component type by name

The renderer SHALL give a view one prop for each field in the definition of its component type, except a field whose label gives an empty name. The name of the prop SHALL be the name that the `wishem/renderer-html/view-types` specification gives for the label of the field. A prop SHALL have no value when the component omits the field. For two fields whose labels give the same name, the prop SHALL have the value of the first field in the definition.

#### Scenario: A component with a color

- **WHEN** an entity has a `Clear color` component whose field with the label `Color` holds `#1d4ed8`
- **THEN** the view gets the prop `color` with the value `#1d4ed8`

#### Scenario: A component that omits the field

- **WHEN** an entity has a `Clear color` component with no value for the `Color` field
- **THEN** the view gets the prop `color` with no value

#### Scenario: A label that gives an empty name

- **WHEN** a component type has the fields `Color` and `???`, and the component holds a value in each field
- **THEN** the view gets the prop `color`, and it gets no other prop

#### Scenario: A label that starts with a digit

- **WHEN** the label of a field is `2nd line`
- **THEN** the view gets the prop `2ndLine`, and the renderer gives no warning for it

### Requirement: The PixiJS renderer warns about a label that gives an empty name

For each view in the table of views whose component type has a field whose label gives an empty name, the renderer SHALL give one warning in the browser console for that field, and SHALL continue to draw. The warning SHALL name the sidecar file, the field ID, and the component type ID, with the same text as the warning of the React renderer. The renderer SHALL give the warnings again only when their text changes.

#### Scenario: A label with no letter or digit

- **WHEN** the `Clear color` component type has a field with the label `???`, and the sidecar `ClearColor.view.json` names that component type
- **THEN** the browser console has one warning that names `ClearColor.view.json`, the field ID, and the component type ID, and the view draws with the prop `color`

#### Scenario: Two labels that give an empty name

- **WHEN** a component type has the fields `???` and `--`, and a sidecar names that component type
- **THEN** the browser console has one warning for each of the two fields, and no other warning

#### Scenario: An input that leaves the definitions as they were

- **WHEN** the renderer gave the warning for a field with the label `???`, and an input then changes the value of a different field
- **THEN** the browser console gets no new warning

#### Scenario: A component type with no component

- **WHEN** a sidecar names a component type with a field whose label is `???`, and no entity has a component of that type
- **THEN** the browser console has one warning for that field

### Requirement: A view that fails does not stop the other views

When the code of a view throws while it makes or sets its display object, the renderer SHALL hide that display object, SHALL give the error to the error handler of the page, and SHALL continue with the other views. The default error handler SHALL write the error to the console.

#### Scenario: A view throws

- **WHEN** one of two views throws while it sets its display object
- **THEN** the display object of that view is hidden, the error handler gets the error one time, and the other view is set

### Requirement: The renderer gives the entity at a point

The renderer SHALL give the entity ID and the component type ID of the top display object that contains a point of the viewport. A point that no visible display object of the renderer contains SHALL give no value.

#### Scenario: A point on the clear-color view

- **WHEN** the clear-color view of the entity `e_5b0e2c4a-9d13-4f7e-8a26-3c1d4e5f6a7b` fills the viewport
- **THEN** the point (10, 10) gives that entity and the `Clear color` component type

#### Scenario: A point outside each display object

- **WHEN** no display object of the renderer contains the point
- **THEN** the renderer gives no value

### Requirement: The renderer stops

When the page stops the renderer, the renderer SHALL remove its listener from the port, and SHALL remove and destroy each display object that it made. It SHALL NOT close the port, and it SHALL NOT change a display object that it did not make. A second stop SHALL do nothing. After the stop, an event of the port SHALL change nothing, and no point SHALL give an entity.

#### Scenario: The renderer is stopped

- **WHEN** the page stops the renderer
- **THEN** the port has no listener of the renderer and is still open, and the container holds no display object of the renderer

#### Scenario: The renderer is stopped two times

- **WHEN** the page stops the renderer a second time
- **THEN** nothing changes and no error occurs

#### Scenario: Two renderers on one container

- **WHEN** two renderers draw in one container and the page stops one of them
- **THEN** the display objects of the other renderer stay in the container
