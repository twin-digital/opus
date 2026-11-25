# Spec Delta

## ADDED Requirements

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

### Requirement: The page warns about a sidecar or a field that it cannot use

The page SHALL give a warning in the browser console, and SHALL continue to draw, in each of these cases: a sidecar names a component type that no definition has, or two fields of one component type have labels that give the same name. The warning SHALL name the sidecar file and the IDs. For a component type with no definition, the page SHALL draw nothing for that sidecar. For two fields with the same name, the prop SHALL have the value of the first field in the definition.

#### Scenario: A sidecar for a component type that is not defined

- **WHEN** `Header.view.json` names a component type ID that no definition has
- **THEN** the page draws the other views, and the browser console has a warning that names `Header.view.json` and the ID

#### Scenario: Two labels that give the same name

- **WHEN** a component type has the fields `Max health` and `max-health`
- **THEN** the browser console has a warning that names the sidecar file and the two field IDs, and the page continues to draw

## MODIFIED Requirements

### Requirement: A view file has one default export

Each view file in the `views` folder of a product SHALL have one default export, which is a function from the props of the view to a picture. The view file SHALL state no ID of a component type and no ID of a field. The renderer SHALL collect each sidecar of the folder and the view file of each sidecar. A view SHALL need no other registration. The name of the file SHALL have no meaning to the renderer, apart from the link between a view file and its sidecar.

#### Scenario: A new view

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

#### Scenario: Two sidecars with the same ID

- **WHEN** `views/AppBar.view.json` and `views/Header.view.json` name the same component type ID
- **THEN** the error names `AppBar.view.json`, `Header.view.json`, and the ID

### Requirement: A warning is given one time for each set of differences

The renderer SHALL write the warnings to the browser console when the set of warnings changes. The renderer SHALL NOT repeat the warnings for a snapshot that has the same set of warnings.

#### Scenario: Two changes to the authored state with the same warning

- **WHEN** a sidecar names a component type that is not defined, and the authored state changes two times with no change to the definitions
- **THEN** the browser console has the warning one time

#### Scenario: The problem is corrected

- **WHEN** a sidecar gave a warning and a person adds the definition file of its component type
- **THEN** the next snapshot gives no warning

## REMOVED Requirements

### Requirement: A view is declared with defineView

**Reason**: The fields in the component type definition are the source. A view does not declare its props, and it states no ID.

**Migration**: Remove the `defineView` call. Export the render function as the default export. Add a sidecar file with the kind `react` and the component type ID. Import the type `Props` from the generated file of the sidecar.

### Requirement: A view gets the values of its declared fields

**Reason**: A view declares no field. The requirement "A view gets the fields of its component type by name" replaces this one.

**Migration**: Use the prop whose name comes from the label of the field. See the `wishem/renderer-html/view-types` specification.

### Requirement: The renderer compares each view with its definition

**Reason**: A view has no declaration to compare. The generated types and the type check find a view that does not agree with its definition. The requirement "The page warns about a sidecar or a field that it cannot use" keeps the warning for a component type that is not defined.

**Migration**: Run the generator and the type check after a change to a definition.
