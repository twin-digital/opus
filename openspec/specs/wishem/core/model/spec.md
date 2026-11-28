# wishem/core/model Specification

## Purpose

Defines the data of a Wishem model, how its things are identified, and which rules make a model correct. These rules apply to each host, with or without files.

## Requirements

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

### Requirement: IDs do not change and labels can change

Each component type, field, and entity SHALL have an ID with three parts: a prefix for the kind of thing, an underscore, and a UUID in lowercase. The prefix SHALL be `ct` for a component type, `fld` for a field, and `e` for an entity. Each component type and each field SHALL have a label that is a string with one character or more. The authored state SHALL refer to a component type and to a field only by ID.

#### Scenario: A label changes

- **WHEN** the label of a component type changes from `AppBar` to `Header`
- **THEN** the model is correct with no change to the entities

#### Scenario: An ID with no prefix

- **WHEN** a component type has the ID `3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34`
- **THEN** the model is not correct, and the problem names the ID

#### Scenario: An ID with the prefix of a different kind

- **WHEN** a field has the ID `ct_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62`
- **THEN** the model is not correct, and the problem names the field and the prefix that is necessary

#### Scenario: An ID of the wrong form

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

- **WHEN** an entity is `{ "id": "e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2", "components": { "ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34": { "fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62": "Wishem" } } }` and the two IDs are a component type and its field
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
