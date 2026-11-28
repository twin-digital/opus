# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
