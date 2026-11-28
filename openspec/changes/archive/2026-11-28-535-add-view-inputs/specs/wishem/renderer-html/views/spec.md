# Spec Delta

## MODIFIED Requirements

### Requirement: A view is a pure function of its props

A view SHALL give the same picture for the same props. A view SHALL hold no state of its own. A view SHALL NOT change the model while it draws. A view SHALL change the model only through the prop `wishem`, in a handler of an event of the person.

#### Scenario: A view with no core

- **WHEN** the render function of a view is called with props and no core runs
- **THEN** it gives the same elements as it gives in the page for a component with those values

#### Scenario: A view draws

- **WHEN** the renderer draws a view two times with the same props
- **THEN** the view calls no function of `wishem`

### Requirement: A view gets the fields of its component type by name

The renderer SHALL give a view one prop for each field in the definition of its component type. The name of the prop SHALL be the name that the `wishem/renderer-html/view-types` specification gives for the label of the field. The value SHALL be the value of the field in the component. A prop SHALL have no value when the component omits the field. The view SHALL decide what it draws for a prop that has no value.

#### Scenario: A component with a title

- **WHEN** an entity has an `AppBar` component whose field with the label `title` holds `Wishem`
- **THEN** the view gets the prop `title` with the value `Wishem`

#### Scenario: A component that omits the field

- **WHEN** an entity has an `AppBar` component with no value for the `title` field
- **THEN** the view gets the prop `title` with no value, and the page draws the app bar with an empty title

#### Scenario: The label of a field changes while the page is open

- **WHEN** a person changes the label of the field `title` to `heading` in the definition file
- **THEN** the view gets the value in the prop `heading` and gets no prop `title`

#### Scenario: A number and a boolean

- **WHEN** a component has the value `3` in a number field with the label `points` and `true` in a boolean field with the label `done`
- **THEN** the view gets the prop `points` with the number `3` and the prop `done` with the boolean `true`

## ADDED Requirements

### Requirement: The page warns about a label that gives a reserved name

When the label of a field gives a reserved name (`wishem` or `key`), the page SHALL give a warning in the browser console that names the sidecar file, the field ID, and the name, and SHALL continue to draw. The view SHALL get no prop for that field.

#### Scenario: A label that gives a reserved name

- **WHEN** a component type has a field with the label `Wishem` or `key`
- **THEN** the browser console has a warning that names the sidecar file, the field ID, and the name, the view gets no prop for that field, and the prop `wishem` is the tools of the view

### Requirement: A view gets the tools to send inputs

The renderer SHALL give each view the prop `wishem`. The names `wishem` and `key` SHALL be reserved, and no field SHALL give them. The prop SHALL have two functions: `setField(name, value)` and `submit(input)`. The prop SHALL be the same object while the entity, the component type, the definition, and the input port do not change.

#### Scenario: The prop of the app bar

- **WHEN** the renderer draws the app bar
- **THEN** the view gets the prop `title` and the prop `wishem`, and `wishem` has `setField` and `submit`

#### Scenario: A new title with the same definition

- **WHEN** the title changes, and the definition, the entity, and the input port do not change
- **THEN** the view gets the same `wishem` object as before

### Requirement: setField sends a set-field input for the component of the view

`wishem.setField(name, value)` SHALL send one `store/set-field` input with the ID of the entity, the ID of the component type, and the ID of the field whose prop has that name. When no field has that name, it SHALL send no input and give a rejection with the reason `invalid` and a problem that names the name. The view SHALL state no ID.

#### Scenario: A checkbox

- **WHEN** the view of a task calls `wishem.setField('done', true)`
- **THEN** the store gets `set-field` with the entity of the task, the component type of the view, the field `done`, and the value `true`

#### Scenario: A name that no field has

- **WHEN** a view calls `wishem.setField('colour', 'red')`, and no field gives the name `colour`
- **THEN** the outcome is a rejection with the reason `invalid` and a problem that names `colour`, and the record holds no input

#### Scenario: A reference

- **WHEN** a view calls `wishem.setField('first', 'e_c3d4e5f6-a7b8-4c9d-8e0f-2a3b4c5d6e7f')` for a reference field
- **THEN** the store gets `set-field` with that entity ID as the value

### Requirement: submit sends one input

`wishem.submit(input)` SHALL send the input as it is through the input port of the renderer.

#### Scenario: An input of a different subsystem

- **WHEN** a view calls `wishem.submit({ type: 'time/set-running', payload: { running: false } })`
- **THEN** the hub gets that input with the source of the input port

### Requirement: Each input of a view has one outcome

Each call of `setField` and of `submit` SHALL give a promise that resolves to one outcome and never rejects. The outcome SHALL be the result of the hub, `unknown` when the link ends before the result, or `failed` when the hub fails to apply the input. Each rejection SHALL hold a reason and a list of problems.

#### Scenario: The hub accepts the input

- **WHEN** the hub accepts the input with the sequence number 4
- **THEN** the outcome is `{ ok: true, seq: 4 }`

#### Scenario: The hub refuses the input

- **WHEN** the store refuses the input with a problem
- **THEN** the outcome has the reason `invalid` and that problem

#### Scenario: The link ends before the result

- **WHEN** a view sends an input, and the link ends before its `result` message
- **THEN** the outcome has the reason `unknown`, and the renderer does not send the input again

#### Scenario: The link ended before the call

- **WHEN** the link of the input port ended, and a view calls `wishem.setField`
- **THEN** the outcome has the reason `not-running`

#### Scenario: Two calls

- **WHEN** a view calls `wishem.setField` two times before the first outcome
- **THEN** the hub gets two inputs in the order of the calls, and each call gets its own outcome

### Requirement: A view can be tested with no hub

The package SHALL give a stub of the prop `wishem`. The stub SHALL record each call, and SHALL give the outcome that the test selects. A test of a view with the stub SHALL need no hub, no port, and no renderer.

#### Scenario: A test of the app bar view

- **WHEN** a test draws the view of the app bar with a stub that gives a rejection with the reason `not-running`, and the person changes the title
- **THEN** the stub records one call `setField('title', <new title>)`, and the view shows the state "not saved"

### Requirement: The prop of a reference field is the picture of the entity

The prop of a `reference` field SHALL be the picture of the entity that the field names: one picture for each of its components that has a view, in the order of the definitions, each in an element marked with that entity and its component type. The prop SHALL have no value when the component omits the field. The view SHALL decide where it puts the picture.

#### Scenario: A list that holds a task

- **WHEN** the reference field `first` of the entity `list` names the entity `task`, and the component types of the two entities have views
- **THEN** the view of `list` gets in the prop `first` the picture of `task`, and the element of the title of `task` is in an element marked with the ID of `task`, inside the element marked with the ID of `list`

#### Scenario: A held entity with no view

- **WHEN** the reference field `first` names an entity that has no component with a view
- **THEN** the view of `list` gets in the prop `first` a picture that draws nothing
