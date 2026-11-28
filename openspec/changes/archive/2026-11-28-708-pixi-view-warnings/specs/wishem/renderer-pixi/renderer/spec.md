# Spec Delta

## ADDED Requirements

### Requirement: The PixiJS renderer warns about a sidecar whose component type has no definition

For each view in the table of views whose component type has no definition in the part `store`, the renderer SHALL give one warning in the browser console, and SHALL continue to draw the other views. The warning SHALL name the sidecar file and the component type ID, with the same text as the warning of the React renderer. When the joined state has no part `store`, the renderer SHALL give no warning.

#### Scenario: A sidecar for a component type that is not defined

- **WHEN** the sidecar `ClearColor.view.json` names a component type ID that no definition of the part `store` has
- **THEN** the browser console has one warning that names `ClearColor.view.json` and the ID, and the renderer draws the other views

#### Scenario: The definition is added

- **WHEN** the renderer gave the warning for a sidecar whose component type has no definition, and an input then adds the definition of that component type
- **THEN** the browser console gets no new warning, and the renderer draws the components of that type

#### Scenario: An input that leaves the definitions as they were

- **WHEN** the renderer gave the warning for a sidecar whose component type has no definition, and an input then changes the value of a field
- **THEN** the browser console gets no new warning

#### Scenario: A joined state with no part store

- **WHEN** the joined state of the port has no part `store`, and the table of views has a view
- **THEN** the browser console gets no warning from the renderer

### Requirement: The PixiJS renderer warns about two labels that give the same name

For each field of the component type of a view whose label gives the same name as the label of an earlier field, the renderer SHALL give one warning in the browser console, and SHALL continue to draw. The warning SHALL name the sidecar file, the ID of the earlier field and of the later field, the component type ID, and the name, with the same text as the warning of the React renderer. The prop SHALL have the value of the first field.

#### Scenario: Two labels that give the same name

- **WHEN** a component type has the fields `Max health` and `max-health`, and a sidecar names that component type
- **THEN** the browser console has one warning that names the sidecar file, the two field IDs, the component type ID, and the name `maxHealth`, and the view gets the prop `maxHealth` with the value of the field `Max health`

#### Scenario: Three labels that give the same name

- **WHEN** a component type has the fields `Color`, `color`, and `color!`, and a sidecar names that component type
- **THEN** the browser console has two warnings: one for the first and the second field, and one for the first and the third field

#### Scenario: An empty name and the same name in one component type

- **WHEN** a component type has the fields `???`, `Max health`, and `max-health`, and a sidecar names that component type
- **THEN** the browser console has the warning for the empty name first, and then the warning for the same name
