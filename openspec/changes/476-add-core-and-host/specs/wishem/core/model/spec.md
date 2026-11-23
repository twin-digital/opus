# Spec Delta

## Purpose

Defines the data of a Wishem model, how its things are identified, and which rules make a model correct. These rules apply to each host, with or without files.

## ADDED Requirements

### Requirement: A model is definitions and authored state

A model SHALL be data with two parts: `definitions`, a list of component types, and `entities`, the authored state as a list of entities. A model with no component types and no entities SHALL be correct. Data that does not have this shape SHALL NOT be a correct model.

#### Scenario: A model with one component type and one entity

- **WHEN** the data holds one component type in `definitions` and one entity in `entities` that uses it
- **THEN** the model is correct

#### Scenario: An empty model

- **WHEN** `definitions` and `entities` are empty lists
- **THEN** the model is correct

#### Scenario: Data of the wrong shape

- **WHEN** `entities` is not a list
- **THEN** the model is not correct, and the problem names `entities`

### Requirement: Definitions are data

A component type SHALL be declared as data with an `id`, a `label`, and a list of `fields`. Each field SHALL have an `id`, a `label`, and a `type`. The only field type SHALL be `string`. A definition SHALL NOT need program code.

#### Scenario: A component type with one field

- **WHEN** a definition is `{ "id": "3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34", "label": "AppBar", "fields": [{ "id": "b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62", "label": "title", "type": "string" }] }`
- **THEN** the model has a component type with the label `AppBar` and one string field with the label `title`

#### Scenario: A field type that is not known

- **WHEN** a field has the type `number`
- **THEN** the model is not correct, and the problem names the component type and the field

### Requirement: IDs do not change and labels can change

Each component type, field, and entity SHALL have an ID that is a UUID in lowercase. Each component type and each field SHALL have a label that is a string with one character or more. The authored state SHALL refer to a component type and to a field only by ID.

#### Scenario: A label changes

- **WHEN** the label of a component type changes from `AppBar` to `Header`
- **THEN** the model is correct with no change to the entities

#### Scenario: An ID that is not a UUID

- **WHEN** a component type has the ID `app-bar`
- **THEN** the model is not correct, and the problem names the ID

#### Scenario: Two things with one ID

- **WHEN** two component types, two fields of one component type, or two entities have the same ID
- **THEN** the model is not correct, and the problem names the ID

#### Scenario: An empty label

- **WHEN** a field has the label `""`
- **THEN** the model is not correct, and the problem names the field

### Requirement: Authored state agrees with the definitions

Each entity SHALL have an `id` and a `components` record. Each key of `components` SHALL be the ID of a component type in the model. Each key of a component SHALL be the ID of a field of that component type, and each value SHALL agree with the type of the field. A component MAY omit a field.

#### Scenario: An entity with one component

- **WHEN** an entity is `{ "id": "c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2", "components": { "3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34": { "b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62": "Wishem" } } }` and the two IDs are a component type and its field
- **THEN** the model is correct

#### Scenario: A component type that is not defined

- **WHEN** an entity has a component whose key is not the ID of a component type in the model
- **THEN** the model is not correct, and the problem names the entity and the key

#### Scenario: A field that is not declared

- **WHEN** a component has a key that is not the ID of a field of its component type
- **THEN** the model is not correct, and the problem names the entity, the component type, and the key

#### Scenario: A value of the wrong type

- **WHEN** a string field has the value `42`
- **THEN** the model is not correct, and the problem names the entity and the field

#### Scenario: An omitted field

- **WHEN** a component does not hold a field that its component type declares
- **THEN** the model is correct

### Requirement: Component types with the same label

Two component types with the same label SHALL be a warning. A warning SHALL NOT make the model incorrect.

#### Scenario: Two component types with the label AppBar

- **WHEN** two component types with different IDs have the label `AppBar`
- **THEN** the model is correct, and a warning names the label and the two IDs
