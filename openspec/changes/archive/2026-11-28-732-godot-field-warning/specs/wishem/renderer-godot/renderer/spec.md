# Spec Delta

## MODIFIED Requirements

### Requirement: A view gets one prop for each field

The renderer SHALL give a view one prop for each field of the definition of its component type, except a field whose label gives an empty name, with the name of the rule of `wishem/renderer-html/view-types`. A field with no value SHALL give no prop. For two fields with one name, the first field SHALL give the value.

#### Scenario: A label of two words

- **WHEN** a field has the label `Max health` and the value `10`
- **THEN** the view gets the prop `maxHealth` with the value `10`

#### Scenario: A label that gives an empty name

- **WHEN** a component type has the fields `???` and `title`, and the component holds a value in each field
- **THEN** the view gets the prop `title`, and it gets no other prop

#### Scenario: A label that starts with a digit

- **WHEN** the label of a field is `2nd line`
- **THEN** the view gets the prop `2ndLine`, and the renderer gives no warning for it

## ADDED Requirements

### Requirement: The Godot renderer warns about a label that gives an empty name

For each view in the table of views whose component type has a field whose label gives an empty name, the renderer SHALL write one warning to the output of Godot for that field, and SHALL continue to draw. The warning SHALL name the sidecar file, the field ID, and the component type ID, with the same text as the warning of the React renderer. The renderer SHALL write the warnings again only when their text changes.

#### Scenario: A label with no letter or digit

- **WHEN** the `Color` component type has a field with the label `???`, and the sidecar `ClearColor.view.json` names that component type
- **THEN** the output of Godot has one warning that names `ClearColor.view.json`, the field ID, and the component type ID, and the view draws with the prop `color`

#### Scenario: Two labels that give an empty name

- **WHEN** a component type has the fields `???` and `--`, and a sidecar names that component type
- **THEN** the output of Godot has one warning for each of the two fields, in the order of the fields, and no other warning

#### Scenario: An input that leaves the definitions as they were

- **WHEN** the renderer wrote the warning for a field with the label `???`, and an input then changes the value of a different field
- **THEN** the output of Godot gets no new warning

#### Scenario: A component type with no component

- **WHEN** a sidecar names a component type with a field whose label is `???`, and no entity has a component of that type
- **THEN** the output of Godot has one warning for that field

### Requirement: The Godot renderer warns about a sidecar whose component type has no definition

For each view in the table of views whose component type has no definition in the part `store`, the renderer SHALL write one warning to the output of Godot, and SHALL continue to draw the other views. The warning SHALL name the sidecar file and the component type ID, with the same text as the warning of the React renderer. When the joined state has no part `store`, the renderer SHALL write no warning.

#### Scenario: A sidecar for a component type that is not defined

- **WHEN** the sidecar `ClearColor.view.json` names a component type ID that no definition of the part `store` has
- **THEN** the output of Godot has one warning that names `ClearColor.view.json` and the ID, and the renderer draws the other views

#### Scenario: The definition is added

- **WHEN** the renderer wrote the warning for a sidecar whose component type has no definition, and an input then adds the definition of that component type
- **THEN** the output of Godot gets no new warning, and the renderer draws the components of that type

#### Scenario: An input that leaves the definitions as they were

- **WHEN** the renderer wrote the warning for a sidecar whose component type has no definition, and an input then changes the value of a field
- **THEN** the output of Godot gets no new warning

#### Scenario: A joined state with no part store

- **WHEN** the joined state of the port has no part `store`, and the table of views has a view
- **THEN** the output of Godot gets no warning from the renderer

### Requirement: The Godot renderer warns about two labels that give the same name

For each field of the component type of a view whose label gives the same name as the label of an earlier field, the renderer SHALL write one warning to the output of Godot, and SHALL continue to draw. The warning SHALL name the sidecar file, the ID of the earlier field and of the later field, the component type ID, and the name, with the same text as the warning of the React renderer. The prop SHALL have the value of the first field.

#### Scenario: Two labels that give the same name

- **WHEN** a component type has the fields `Max health` and `max-health`, and a sidecar names that component type
- **THEN** the output of Godot has one warning that names the sidecar file, the two field IDs, the component type ID, and the name `maxHealth`, and the view gets the prop `maxHealth` with the value of the field `Max health`

#### Scenario: Three labels that give the same name

- **WHEN** a component type has the fields `Color`, `color`, and `color!`, and a sidecar names that component type
- **THEN** the output of Godot has two warnings: one for the first and the second field, and one for the first and the third field

#### Scenario: An empty name and the same name in one component type

- **WHEN** a component type has the fields `???`, `Max health`, and `max-health`, and a sidecar names that component type
- **THEN** the output of Godot has the warning for the empty name first, and then the warning for the same name

#### Scenario: A new link of the application

- **WHEN** the Godot application wrote the warning for two labels that give the same name, the construct stops, and the application connects to the construct again
- **THEN** the output of Godot has the warning one more time, after the line `wishem-godot: connected (link 2)`
