# wishem/renderer-html/views Specification

## Purpose

Defines how the HTML renderer changes a component of an entity into a picture: how a view is declared, how it is linked to its component type, which values it gets, and what happens when a view and the definitions of the model are different.

## Requirements

### Requirement: A view file has one default export

Each view file in the `views` folder of a product SHALL have one default export, which is a function from the props of the view to a picture. The view file SHALL state no ID of a component type and no ID of a field. The renderer SHALL collect each sidecar of the folder and the view file of each sidecar. A view SHALL need no other registration. The name of the file SHALL have no meaning to the renderer, apart from the link between a view file and its sidecar.

#### Scenario: A new view file

- **WHEN** a person adds a view file and its sidecar to the `views` folder for a component type that has a definition
- **THEN** the page draws each component of that type, and no other file of the renderer changes

#### Scenario: A file that exports no view

- **WHEN** a view file that has a sidecar has no default export that is a function
- **THEN** the page reports an error that names the sidecar file, and it draws no view

### Requirement: A view is linked to its component type by ID

The renderer SHALL find the view of a component by the ID of the component type in the sidecar of the view. The renderer SHALL NOT use the label of a component type or the name of a file. A component whose component type has no view SHALL NOT be drawn, and this SHALL NOT be an error.

#### Scenario: The label of a component type changes

- **WHEN** the label of the component type `AppBar` changes to `Header` in its definition file
- **THEN** the page draws the app bar as before

#### Scenario: A component type with no view

- **WHEN** an entity has a component whose component type has no view
- **THEN** the page draws nothing for that component and reports no error

### Requirement: Two views for one component type are an error

When two sidecars of the kind `react` name the same component type ID, the page SHALL report one error that names the two sidecar files and the ID. The page SHALL draw no view.

#### Scenario: Two files with the same ID

- **WHEN** `views/AppBar.view.json` and `views/Header.view.json` name the same component type ID
- **THEN** the error names `AppBar.view.json`, `Header.view.json`, and the ID

### Requirement: A view is a pure function of its props

A view SHALL give the same picture for the same props. A view SHALL hold no state of its own. A view SHALL NOT change the model while it draws. A view SHALL change the model only through the prop `wishem`, in a handler of an event of the person.

#### Scenario: A view with no core

- **WHEN** the render function of a view is called with props and no core runs
- **THEN** it gives the same elements as it gives in the page for a component with those values

#### Scenario: A view draws

- **WHEN** the renderer draws a view two times with the same props
- **THEN** the view calls no function of `wishem`

### Requirement: A warning is given one time for each set of differences

The renderer SHALL write the warnings to the browser console when the set of warnings changes. The renderer SHALL NOT repeat the warnings for a snapshot that has the same set of warnings.

#### Scenario: Two changes to the authored state with the same difference

- **WHEN** a sidecar names a component type that is not defined, and the authored state changes two times with no change to the definitions
- **THEN** the browser console has the warning one time

#### Scenario: The difference is corrected

- **WHEN** a sidecar gave a warning and a person adds the definition file of its component type
- **THEN** the next snapshot gives no warning

### Requirement: A sidecar attaches a view to its component type

A view SHALL be attached to a component type by a sidecar file in the same folder. The sidecar of the view file `<name>.tsx` SHALL be `<name>.view.json`. The sidecar SHALL be a JSON object with two entries: `kind`, the kind of the view, and `componentType`, the ID of one component type. The kind of a view that the HTML renderer runs SHALL be `react`. The model folder SHALL NOT name a view.

#### Scenario: The sidecar of the app bar

- **WHEN** the `views` folder has `AppBar.tsx` and `AppBar.view.json` with the kind `react` and the component type `ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34`
- **THEN** the page draws each component of that type with the view of `AppBar.tsx`

#### Scenario: A view file with no sidecar

- **WHEN** the `views` folder has `Helper.tsx` and no `Helper.view.json`
- **THEN** the page draws no component with that file and reports no error

#### Scenario: A sidecar of a different kind

- **WHEN** a sidecar in the `views` folder has a kind that is not `react`
- **THEN** the HTML renderer does not use that sidecar and reports no error

### Requirement: A sidecar that is not correct is an error

When a sidecar of the kind `react` has no view file, or its view file has no default export that is a function, the page SHALL report one error that names the sidecar file. When a sidecar is not a JSON object with a `kind` and a `componentType` that are text, the page SHALL report one error that names the sidecar file. After such an error, the page SHALL draw no view.

#### Scenario: A sidecar with no view file

- **WHEN** the `views` folder has `Header.view.json` and no `Header.tsx`
- **THEN** the page reports an error that names `Header.view.json`, and it draws no view

#### Scenario: A sidecar with no component type

- **WHEN** `AppBar.view.json` has a `kind` and no `componentType`
- **THEN** the page reports an error that names `AppBar.view.json`, and it draws no view

### Requirement: A view gets the fields of its component type by name

The renderer SHALL give a view one prop for each field in the definition of its component type, except a field whose label gives an empty name or a reserved name. The name of the prop SHALL be the name that the `wishem/renderer-html/view-types` specification gives for the label of the field. The value SHALL be the value of the field in the component. A prop SHALL have no value when the component omits the field. The view SHALL decide what it draws for a prop that has no value.

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

#### Scenario: A label that gives an empty name

- **WHEN** a component type has the fields `title` and `???`, and the component holds a value in each field
- **THEN** the view gets the prop `title` and the prop `wishem`, and it gets no other prop

### Requirement: The page warns about a sidecar or a field that it cannot use

The page SHALL give a warning in the browser console, and SHALL continue to draw, in each of these cases: a sidecar names a component type that no definition has, or two fields of one component type have labels that give the same name. The warning SHALL name the sidecar file and the IDs. For a component type with no definition, the page SHALL draw nothing for that sidecar. For two fields with the same name, the prop SHALL have the value of the first field in the definition.

#### Scenario: A sidecar for a component type that is not defined

- **WHEN** `Header.view.json` names a component type ID that no definition has
- **THEN** the page draws the other views, and the browser console has a warning that names `Header.view.json` and the ID

#### Scenario: Two labels that give the same name

- **WHEN** a component type has the fields `Max health` and `max-health`
- **THEN** the browser console has a warning that names the sidecar file and the two field IDs, and the page continues to draw

### Requirement: The product gives its views to the table of views

The table of views SHALL be a part of the React renderer package. The product SHALL give the table its sidecars and its view files as loaded modules, each with the path of its file. The package SHALL read no folder and SHALL know no folder of a product. The views and the sidecars SHALL be files of the product.

#### Scenario: The views of the workbench

- **WHEN** the page of the workbench gives the sidecars and the view files of its `src/views` folder to the table of views
- **THEN** the table has the view of `AppBar.tsx` for the component type `ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34`

#### Scenario: A product with no views

- **WHEN** a product gives no sidecar and no view file
- **THEN** the table of views is empty, and the renderer draws nothing and reports no error

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

### Requirement: The page warns about a label that gives an empty name

When the label of a field gives an empty name, the page SHALL give one warning in the browser console for that field, and SHALL continue to draw. The warning SHALL name the sidecar file, the field ID, and the component type ID. `setField` of the tools of the view SHALL give the outcome `invalid` for the name `""`.

#### Scenario: A label with no letter or digit

- **WHEN** a component type has a field with the label `???`, and a sidecar names that component type
- **THEN** the browser console has one warning that names the sidecar file, the field ID, and the component type ID, and the page draws the view with the other props

#### Scenario: Two labels that give an empty name

- **WHEN** a component type has the fields `???` and `--`
- **THEN** the browser console has one warning for each of the two fields, and no warning that the two fields give the same name

#### Scenario: setField with an empty name

- **WHEN** a view calls `wishem.setField('', 'x')`
- **THEN** the outcome is `invalid`, and the hub gets no input
