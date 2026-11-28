# Spec Delta

## MODIFIED Requirements

### Requirement: Definitions are data

A component type SHALL be declared as data with an `id`, a `label`, and a list of `fields`. Each field SHALL have an `id`, a `label`, and a `type`. The field types SHALL be `string`, `number`, `boolean`, `reference`, and `reference-list`. A definition SHALL NOT need program code.

#### Scenario: A component type with one field

- **WHEN** a definition is `{ "id": "ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34", "label": "AppBar", "fields": [{ "id": "fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62", "label": "title", "type": "string" }] }`
- **THEN** the model has a component type with the label `AppBar` and one string field with the label `title`

#### Scenario: A component type with each field type

- **WHEN** a component type has five fields with the types `string`, `number`, `boolean`, `reference`, and `reference-list`
- **THEN** the model is correct, and each field has its type

#### Scenario: A field type that is not known

- **WHEN** a field has the type `date`
- **THEN** the model is not correct, and the problem names the component type, the field, and the five field types

## ADDED Requirements

### Requirement: A value of a reference-list field is a list of entity IDs

A value of a `reference-list` field SHALL be a JSON list. Each item SHALL be the ID of an entity of the same model, by the rules of a `reference` value. No ID SHALL be in one list two times. An empty list SHALL be a correct value, and it SHALL be different from an omitted field. The order of the items SHALL be part of the value.

#### Scenario: A list of two entities

- **WHEN** a `reference-list` field of the entity `deck` holds the IDs of the entities `goat` and `owl`
- **THEN** the model is correct, and the value holds the two IDs in that order

#### Scenario: An empty list

- **WHEN** a `reference-list` field holds `[]`
- **THEN** the model is correct, and the component holds the field with the value `[]`

#### Scenario: A value that is not a list

- **WHEN** a `reference-list` field holds the ID of one entity as a string
- **THEN** the model is not correct, and the problem names the entity, the field, and the type `reference-list`

#### Scenario: An item that is not an entity ID

- **WHEN** a `reference-list` field holds `["hero"]`
- **THEN** the model is not correct, and the problem names the entity, the field, and the index `0` of the item

#### Scenario: An item that names no entity

- **WHEN** a `reference-list` field holds the ID `e_00000000-0000-4000-8000-000000000000` at the index `1`, and no entity has that ID
- **THEN** the model is not correct, and the problem names the entity, the field, the ID, and the index `1`

#### Scenario: An ID two times

- **WHEN** a `reference-list` field holds the ID of `goat` at the index `0` and at the index `2`
- **THEN** the model is not correct, and the problem names the entity, the field, the ID of `goat`, and the index `2`

#### Scenario: A list that names its own entity

- **WHEN** a `reference-list` field of the entity `deck` holds the ID of `deck`
- **THEN** the model is correct
