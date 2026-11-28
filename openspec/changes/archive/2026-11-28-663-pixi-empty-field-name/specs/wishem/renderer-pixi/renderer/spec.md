# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
