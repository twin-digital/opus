# wishem/renderer-html/views Specification

## Purpose

Defines how the HTML renderer changes a component of an entity into a picture: how a view is declared, how it is linked to its component type, which values it gets, and what happens when a view and the definitions of the model are different.

## Requirements

### Requirement: A view is declared with defineView

A view SHALL be declared with `defineView`. The declaration SHALL hold the ID of one component type, a declaration of the props, and a render function. For each prop, the declaration SHALL give the name of the prop in code, the ID of a field, and the type of the field. The types of the props of the render function SHALL come from the declaration, with no generated code.

#### Scenario: The view of the app bar

- **WHEN** a view declares the component type `ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34` and a prop `title` for the field `fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62` of the type `string`
- **THEN** the render function gets a prop `title` whose type is a string or no value

#### Scenario: A prop that is not declared

- **WHEN** the render function of a view reads a prop that its declaration does not have
- **THEN** the type check of the package fails

### Requirement: A view file has one default export

Each file in the `views` folder of a product SHALL have one default export, which is the result of `defineView`. The renderer SHALL collect each file of the folder. A view SHALL need no other registration. The name of the file SHALL have no meaning to the renderer.

#### Scenario: A new view file

- **WHEN** a person adds a file to the `views` folder that exports a view for a component type
- **THEN** the page draws each component of that type, and no other file changes

#### Scenario: A file that exports no view

- **WHEN** a file in the `views` folder has no default export from `defineView`
- **THEN** the page reports an error that names the file, and it draws no view

### Requirement: A view is linked to its component type by ID

The renderer SHALL find the view of a component by the ID of the component type. The renderer SHALL NOT use the label of a component type or the name of a file. A component whose component type has no view SHALL NOT be drawn, and this SHALL NOT be an error.

#### Scenario: The label of a component type changes

- **WHEN** the label of the component type `AppBar` changes to `Header` in its definition file
- **THEN** the page draws the app bar as before

#### Scenario: A component type with no view

- **WHEN** an entity has a component whose component type has no view
- **THEN** the page draws nothing for that component and reports no error

### Requirement: Two views for one component type are an error

When two view files declare the same component type ID, the page SHALL report one error that names the two files and the ID. The page SHALL draw no view.

#### Scenario: Two files with the same ID

- **WHEN** `views/AppBar.tsx` and `views/Header.tsx` declare the same component type ID
- **THEN** the error names `AppBar.tsx`, `Header.tsx`, and the ID

### Requirement: A view gets the values of its declared fields

The renderer SHALL give each prop of a view the value of its declared field in the component. A prop SHALL have no value when the component omits the field or when the definition of the component type does not have the field. The view SHALL decide what it draws for a prop that has no value.

#### Scenario: A component with a title

- **WHEN** an entity has an `AppBar` component whose `title` field holds `Wishem`
- **THEN** the view gets the prop `title` with the value `Wishem`

#### Scenario: A component that omits the field

- **WHEN** an entity has an `AppBar` component with no value for the `title` field
- **THEN** the view gets the prop `title` with no value, and the page draws the app bar with an empty title

### Requirement: A view is a pure function of its props

A view SHALL give the same picture for the same props. A view SHALL hold no state of its own. A view SHALL NOT change the model while it draws.

#### Scenario: A view with no core

- **WHEN** the render function of a view is called with props and no core runs
- **THEN** it gives the same elements as it gives in the page for a component with those values

### Requirement: The renderer compares each view with its definition

On each snapshot, the renderer SHALL compare the declaration of each view with the definitions of the snapshot. A difference SHALL be one of these: the component type ID is not in the definitions, a declared field ID is not in the component type, or a declared field has a different type. A difference SHALL NOT be an error: the page SHALL continue to draw. A field of the definition that the view does not declare SHALL NOT be a difference.

#### Scenario: A view for a component type that is not defined

- **WHEN** a view declares a component type ID that no definition has
- **THEN** the page draws the other views, and the browser console has a warning that names the view file and the ID

#### Scenario: A field is removed from a definition while the page is open

- **WHEN** a person removes the `title` field from the definition file of `AppBar` and from the authored state
- **THEN** the browser console has a warning that names `AppBar.tsx` and the field ID, and the page draws the app bar with an empty title

### Requirement: A warning is given one time for each set of differences

The renderer SHALL write the warnings to the browser console when the set of differences changes. The renderer SHALL NOT repeat the warnings for a snapshot that has the same set of differences.

#### Scenario: Two changes to the authored state with the same difference

- **WHEN** a view has a difference, and the authored state changes two times with no change to the definitions
- **THEN** the browser console has the warning one time

#### Scenario: The difference is corrected

- **WHEN** a view had a difference and a person corrects the definition file
- **THEN** the next snapshot gives no warning
