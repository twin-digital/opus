# Spec Delta

## MODIFIED Requirements

### Requirement: A label that gives no usable name is an error of the generator

The generator SHALL report an error, and SHALL write no file for that sidecar, in each of these cases: the label of a field gives an empty name, a name that starts with a digit, or a reserved name (`wishem` or `key`), or two fields of one component type give the same name. The error SHALL name the sidecar file, the component type ID, and the field IDs.

#### Scenario: Two labels that give the same name

- **WHEN** a component type has the fields `Max health` and `max-health`, and a sidecar names that component type
- **THEN** the generator reports one error that names the sidecar file and the two field IDs

#### Scenario: A label that starts with a digit

- **WHEN** the label of a field is `2nd line`
- **THEN** the generator reports an error that names the field ID

#### Scenario: A label that gives a reserved name

- **WHEN** the label of a field is `Wishem`
- **THEN** the generator reports an error that names the sidecar file, the field ID, and the name `wishem`, and it writes no file for that sidecar

#### Scenario: A label that gives an empty name

- **WHEN** the label of a field is `???`, and a sidecar names its component type
- **THEN** the generator reports one error that names the sidecar file, the component type ID, and the field ID, and it writes no file for that sidecar
