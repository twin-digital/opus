# Spec Delta

## Purpose

Defines how a Wishem model is stored as files in a model folder, how its things are identified, and which rules make a model correct.

## ADDED Requirements

### Requirement: Model folder layout

A model folder SHALL hold a `definitions` folder and a `state.json` file. Each `.json` file in `definitions` SHALL hold one component type. `state.json` SHALL hold the authored state as a list of entities. A file in `definitions` that does not end in `.json` SHALL be ignored.

#### Scenario: A model with one component type and one entity

- **WHEN** a model folder holds `definitions/3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34.json` and `state.json`
- **THEN** the model has one component type and the entities of `state.json`

#### Scenario: No state file

- **WHEN** a model folder has no `state.json`
- **THEN** the model is not correct, and the problem names the missing file

#### Scenario: No definitions

- **WHEN** a model folder has no `definitions` folder, or the folder is empty
- **THEN** the model has no component types, and this is not a problem

### Requirement: Definitions are data

A component type SHALL be declared as JSON data with an `id`, a `label`, and a list of `fields`. Each field SHALL have an `id`, a `label`, and a `type`. The only field type SHALL be `string`. A definition SHALL NOT need program code.

#### Scenario: A component type with one field

- **WHEN** a definition file holds `{ "id": "3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34", "label": "AppBar", "fields": [{ "id": "b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62", "label": "title", "type": "string" }] }`
- **THEN** the model has a component type with the label `AppBar` and one string field with the label `title`

#### Scenario: A field type that is not known

- **WHEN** a field has the type `number`
- **THEN** the model is not correct, and the problem names the file and the field

### Requirement: IDs do not change and labels can change

Each component type, field, and entity SHALL have an ID that is a UUID in lowercase. Each component type and each field SHALL have a label that is a string with one character or more. The authored state SHALL refer to a component type and to a field only by ID. The name of a definition file SHALL have no meaning.

#### Scenario: A label changes

- **WHEN** the label of a component type changes from `AppBar` to `Header` in its definition file
- **THEN** the model is correct with no change to `state.json` and no change to a file name

#### Scenario: An ID that is not a UUID

- **WHEN** a component type has the ID `app-bar`
- **THEN** the model is not correct, and the problem names the file and the ID

#### Scenario: Two things with one ID

- **WHEN** two component types, two fields of one component type, or two entities have the same ID
- **THEN** the model is not correct, and the problem names the ID

### Requirement: Authored state agrees with the definitions

Each entity in `state.json` SHALL have an `id` and a `components` record. Each key of `components` SHALL be the ID of a component type in the model. Each key of a component SHALL be the ID of a field of that component type, and each value SHALL agree with the type of the field. A component MAY omit a field.

#### Scenario: An entity with one component

- **WHEN** `state.json` holds `{ "entities": [{ "id": "c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2", "components": { "3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34": { "b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62": "Wishem" } } }] }` and the two IDs are a component type and its field
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

### Requirement: Files that are not valid JSON

A model SHALL NOT be correct when `state.json` or a definition file is not valid JSON, or when its content does not have the required shape.

#### Scenario: A file that is saved in part

- **WHEN** `state.json` holds text that is not valid JSON
- **THEN** the model is not correct, and the problem names the file

### Requirement: Component types with the same label

Two component types with the same label SHALL be a warning. A warning SHALL NOT make the model incorrect.

#### Scenario: Two component types with the label AppBar

- **WHEN** two component types with different IDs have the label `AppBar`
- **THEN** the model is correct, and a warning names the label and the two IDs
