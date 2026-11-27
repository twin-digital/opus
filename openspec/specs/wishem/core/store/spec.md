# wishem/core/store Specification

## Purpose

Defines the store: the model subsystem that holds the definitions and the entities of a model in a construct. It gives the part of the joined state that a renderer and a tool read, and it applies the inputs that change the model. The rules for a correct model belong to `wishem/core/model`.

## Requirements

### Requirement: The store is a model subsystem that holds one model

The store SHALL be a model subsystem of a hub. Its part of the joined state SHALL be one model, with the keys `definitions` and `entities`, in the form of `wishem/core/model`. The store SHALL have the ID `store` unless the code that makes it gives a different ID. The types of its inputs SHALL start with the ID of the store and a slash.

#### Scenario: A hub with a store

- **WHEN** a hub is made with a store that starts from the model of the base workbench
- **THEN** the joined state has the key `store`, and that part holds the component type `AppBar` and the entity of the app bar

#### Scenario: A store with a different ID

- **WHEN** a store is made with the ID `product`
- **THEN** its part is under the key `product`, and it applies the input type `product/set-field` and not `store/set-field`

### Requirement: A store starts from a correct model or from an empty model

The code that makes a store SHALL be able to give its first model. The store SHALL refuse to be made from a model that is not correct, with the list of problems. A store that is made with no model SHALL hold a model with no definitions and no entities.

#### Scenario: A first model that is not correct

- **WHEN** a store is made from a model in which an entity has a component of a type that is not defined
- **THEN** the store is not made, and the error holds the problem

#### Scenario: No first model

- **WHEN** a store is made with no model
- **THEN** its part has an empty list of definitions and an empty list of entities

### Requirement: An input replaces the model

The input `replace-model` SHALL hold a full model. When that model is correct, it SHALL become the part of the store. When that model is equal to the current part, the part SHALL stay the same object.

#### Scenario: A new title arrives with a full model

- **WHEN** the store gets `replace-model` with a model in which the title of the app bar is `Wishem workbench`
- **THEN** the part holds the title `Wishem workbench`

#### Scenario: An equal model

- **WHEN** the store gets `replace-model` with a model that is equal to its part
- **THEN** the part is the same object as before

### Requirement: An input adds an entity

The input `add-entity` SHALL hold one entity with its ID and its components. The store SHALL add the entity at the end of the list of entities. The store SHALL refuse the input when an entity with that ID exists.

#### Scenario: A second entity

- **WHEN** the store holds one entity and gets `add-entity` with a correct entity that has a new ID
- **THEN** the part holds two entities, and the new entity is the last one

#### Scenario: An ID that exists

- **WHEN** the store gets `add-entity` with the ID of an entity that it holds
- **THEN** the store refuses the input with a problem that names the ID

### Requirement: An input removes an entity

The input `remove-entity` SHALL hold the ID of one entity. The store SHALL remove that entity. The store SHALL refuse the input when no entity has that ID.

#### Scenario: An entity is removed

- **WHEN** the store holds two entities and gets `remove-entity` with the ID of the first one
- **THEN** the part holds only the second entity

#### Scenario: An ID that does not exist

- **WHEN** the store gets `remove-entity` with an ID that no entity has
- **THEN** the store refuses the input with a problem that names the ID

### Requirement: An input sets a field value

The input `set-field` SHALL hold the ID of an entity, the ID of a component type, the ID of a field, and a value. The store SHALL set that value in the component of the entity. When the entity has no component of that type, the store SHALL add the component with that one value. The store SHALL refuse the input when the entity does not exist, when the component type is not defined, when the field is not a field of the component type, or when the value does not have the type of the field.

#### Scenario: A new title

- **WHEN** the store gets `set-field` for the `title` field of the `AppBar` component of the app bar with the value `Wishem workbench`
- **THEN** the part holds that value, and each other entity is unchanged

#### Scenario: A component that the entity does not have

- **WHEN** an entity has no `AppBar` component, and the store gets `set-field` for the `title` field of `AppBar` on that entity
- **THEN** the entity has an `AppBar` component with that one value

#### Scenario: A field of a different component type

- **WHEN** the store gets `set-field` with a field ID that is not a field of the named component type
- **THEN** the store refuses the input with a problem that names the field

#### Scenario: A value of an incorrect type

- **WHEN** the store gets `set-field` for a string field with the value `7` as a number
- **THEN** the store refuses the input

### Requirement: The store refuses an input that makes the model incorrect

The store SHALL apply an input only when the model after the input is correct by the rules of `wishem/core/model`. It SHALL refuse each other input, and each input whose payload does not have the correct form, with a list of problems. Each problem SHALL have a message and the place of the fault. After a refusal, the part of the store SHALL be the same object as before, and the record of the hub SHALL NOT hold the input.

#### Scenario: A payload with no entity

- **WHEN** an input subsystem sends `store/add-entity` with an empty payload
- **THEN** the result of the hub is a rejection with the reason `invalid` and one problem or more, and the part of the store is the same object as before

#### Scenario: A full model that is not correct

- **WHEN** an input subsystem sends `store/replace-model` with a model in which two component types have one ID
- **THEN** the result is a rejection with the reason `invalid`, the problems name the ID, and the store keeps its model

### Requirement: The part of the store does not change in place

Each part that the store gives SHALL be frozen, with each value in it. After an input that the store applies, the earlier part SHALL be unchanged, and an entity that the input did not change SHALL be the same object in the new part, except after `replace-model`.

#### Scenario: A reader keeps the earlier part

- **WHEN** a reader keeps the part, and then the store applies `set-field` on one of two entities
- **THEN** the earlier part still holds the earlier value, and the other entity is the same object in the two parts

### Requirement: The same inputs give the same model

Two stores that start from equal models and get the same inputs in the same order SHALL hold equal models. The store SHALL make no ID and SHALL read no clock and no random value.

#### Scenario: Two hubs with the same record

- **WHEN** the inputs of the record of one hub are sent in order to a second hub that has a store with an equal first model
- **THEN** the store parts of the two hubs are equal

### Requirement: The store runs with no Node.js API

The store and the validation of a model SHALL run in a web browser and in Node.js. They SHALL NOT read a file, open a port, or use an API that only Node.js has.

#### Scenario: The store in a process with no file system

- **WHEN** a hub with a store is made from model data in an environment that has no file system
- **THEN** the store gives its part and applies inputs

### Requirement: The checks of the repository keep Node.js APIs out of the core package

The source code of the package `@thrashplay/wishem-core`, without its test files, SHALL NOT import a Node.js module and SHALL NOT use a Node.js global. A check that runs in the pull request checks of the repository SHALL fail when the source code breaks this rule. A test file of the package MAY use a Node.js API.

#### Scenario: An import of a Node.js module with the node prefix

- **WHEN** a source file of the package has `import { readFileSync } from 'node:fs'`
- **THEN** the check fails and names the file

#### Scenario: An import of a Node.js module with no prefix

- **WHEN** a source file of the package has `import { join } from 'path'`
- **THEN** the check fails and names the file

#### Scenario: A Node.js global

- **WHEN** a source file of the package uses `process.env` or `Buffer`
- **THEN** the check fails and names the file

#### Scenario: A test file

- **WHEN** a test file of the package imports `node:fs`
- **THEN** the check passes
