# Spec Delta

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: The renderer only reads

**Reason**: A view can send an input. The renderer sends the inputs of its views through the input port that it gets.
**Migration**: See the requirements "The renderer sends an input only for a view" and "The renderer does not attach or close a port".

## ADDED Requirements

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

An entity SHALL be held when a reference field of a component of a different entity names it, and the component type of that component has a view. The renderer SHALL give the picture of a held entity to the view of its holder, and SHALL NOT draw the held entity at the top level. An entity that two holders name SHALL be drawn in the place of each holder.

#### Scenario: Two holders

- **WHEN** the entities `a` and `b` each have a component with a view whose reference field names `task`
- **THEN** the renderer draws `task` in the picture of `a` and in the picture of `b`, and each picture of `task` is in an element marked with the ID of `task`

#### Scenario: A reference field of a component type with no view

- **WHEN** the only reference that names `task` is in a component whose component type has no view
- **THEN** the renderer draws `task` at the top level

#### Scenario: The reference changes

- **WHEN** the renderer draws `task` in the picture of `list`, and an input sets the reference field of `list` to the entity `other`
- **THEN** the renderer draws `other` in the picture of `list`, and draws `task` at the top level

### Requirement: A cycle of references draws each entity one time on its path

When a held entity holds, through its own reference fields, an entity that is already on the path from the top level, the renderer SHALL draw nothing for that reference. The renderer SHALL give one warning in the browser console for each set of such cycles, by the rule of the other warnings of the views. An entity that holds itself SHALL count as a cycle.

#### Scenario: Two entities that hold each other

- **WHEN** the entity `root` holds `a`, `a` holds `b`, and `b` holds `a`
- **THEN** the renderer draws `root`, then `a` in `root`, then `b` in `a`, and nothing for the reference of `b`, and the browser console has one warning that names `b`, the field, and `a`

#### Scenario: A cycle with no entity at the top level

- **WHEN** the entities `a` and `b` hold each other, and no other entity holds them
- **THEN** the renderer draws neither of them, and the browser console has one warning
