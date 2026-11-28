# Spec Delta

## MODIFIED Requirements

### Requirement: Definitions are data

A component type SHALL be declared as data with an `id`, a `label`, and a list of `fields`. Each field SHALL have an `id`, a `label`, and a `type`. The field types SHALL be `string`, `number`, `boolean`, and `reference`. A definition SHALL NOT need program code.

#### Scenario: A component type with one field

- **WHEN** a definition is `{ "id": "ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34", "label": "AppBar", "fields": [{ "id": "fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62", "label": "title", "type": "string" }] }`
- **THEN** the model has a component type with the label `AppBar` and one string field with the label `title`

#### Scenario: A component type with each field type

- **WHEN** a component type has four fields with the types `string`, `number`, `boolean`, and `reference`
- **THEN** the model is correct, and each field has its type

#### Scenario: A field type that is not known

- **WHEN** a field has the type `date`
- **THEN** the model is not correct, and the problem names the component type, the field, and the four field types

## ADDED Requirements

### Requirement: A value agrees with the type of its field

A value of a `string` field SHALL be a string. A value of a `number` field SHALL be a finite JSON number. A value of a `boolean` field SHALL be `true` or `false`. A value of a `reference` field SHALL be the ID of an entity of the same model. The entity that a reference names MAY be the entity that holds the reference, and MAY be later in the list of entities.

#### Scenario: A value of the wrong type

- **WHEN** a string field has the value `42`, a number field has the value `"42"`, or a boolean field has the value `"true"`
- **THEN** the model is not correct, and each problem names the entity, the field, and the type of the field

#### Scenario: A number field with a number

- **WHEN** a number field has the value `-2.5`
- **THEN** the model is correct

#### Scenario: A reference to an entity of the model

- **WHEN** a reference field of the first entity holds the ID of the second entity
- **THEN** the model is correct

#### Scenario: A reference to an entity that does not exist

- **WHEN** a reference field holds the ID `e_00000000-0000-4000-8000-000000000000`, and no entity has that ID
- **THEN** the model is not correct, and the problem names the entity, the field, and the ID

#### Scenario: A reference that is not an entity ID

- **WHEN** a reference field holds the value `"hero"`, or the ID of a component type
- **THEN** the model is not correct, and the problem names the entity and the field
