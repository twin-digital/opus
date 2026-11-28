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

The input `add-entity` SHALL hold one entity with its ID and its components, and MAY hold an `index`. With no `index`, the store SHALL add the entity at the end of the list of entities. With an `index`, the store SHALL put the entity at that position, and the entities from that position SHALL move one position back. The store SHALL refuse the input when an entity with that ID exists, and when `index` is not an integer from 0 to the number of entities.

#### Scenario: A second entity

- **WHEN** the store holds one entity and gets `add-entity` with a correct entity that has a new ID
- **THEN** the part holds two entities, and the new entity is the last one

#### Scenario: An ID that exists

- **WHEN** the store gets `add-entity` with the ID of an entity that it holds
- **THEN** the store refuses the input with a problem that names the ID

#### Scenario: An entity at the start

- **WHEN** the store holds the entities `a` and `b` and gets `add-entity` with the entity `c` and the `index` 0
- **THEN** the part holds `c`, `a`, and `b` in this order, and `a` and `b` are the same objects as before

#### Scenario: An entity between two entities

- **WHEN** the store holds the entities `a` and `b` and gets `add-entity` with the entity `c` and the `index` 1
- **THEN** the part holds `a`, `c`, and `b` in this order

#### Scenario: An index at the end

- **WHEN** the store holds two entities and gets `add-entity` with a new entity and the `index` 2
- **THEN** the new entity is the last one

#### Scenario: An index that is not correct

- **WHEN** the store holds two entities and gets `add-entity` with the `index` 3, -1, 1.5, or `"1"`
- **THEN** the store refuses the input with a problem at the path `payload`, `index`, and the part is the same object as before

### Requirement: An input removes an entity

The input `remove-entity` SHALL hold the ID of one entity. The store SHALL remove that entity. The store SHALL refuse the input when no entity has that ID, and when a `reference` field or a `reference-list` field of a different entity names that entity.

#### Scenario: An entity is removed

- **WHEN** the store holds two entities and gets `remove-entity` with the ID of the first one
- **THEN** the part holds only the second entity

#### Scenario: An ID that does not exist

- **WHEN** the store gets `remove-entity` with an ID that no entity has
- **THEN** the store refuses the input with a problem that names the ID

#### Scenario: An entity that a different entity refers to

- **WHEN** a reference field of the entity `list` names the entity `task`, and the store gets `remove-entity` for `task`
- **THEN** the store refuses the input with a problem that names `list`, the field, and the ID of `task`, and the part is the same object as before

#### Scenario: An entity that refers only to itself

- **WHEN** a reference field of an entity names that same entity, and the store gets `remove-entity` for it
- **THEN** the store removes the entity

#### Scenario: An entity in a list of a different entity

- **WHEN** a `reference-list` field of the entity `deck` holds the ID of `goat`, and the store gets `remove-entity` for `goat`
- **THEN** the store refuses the input with a problem that names `deck`, the field, and the ID of `goat`, and the part is the same object as before

#### Scenario: An entity after its removal from the list

- **WHEN** the store applied `remove-reference` of `goat` from the only list that names `goat`, and then gets `remove-entity` for `goat`
- **THEN** the store removes `goat`

### Requirement: An input sets a field value

The input `set-field` SHALL hold the ID of an entity, the ID of a component type, the ID of a field, and a value. The store SHALL set that value in the component of the entity. When the entity has no component of that type, the store SHALL add the component with that one value. The store SHALL refuse the input when the entity does not exist, when the component type is not defined, when the field is not a field of the component type, or when the value does not agree with the type of the field.

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

#### Scenario: A number and a boolean

- **WHEN** the store gets `set-field` with the value `3` for a number field, and then with `true` for a boolean field
- **THEN** the part holds `3` and `true`

#### Scenario: A reference to an entity that does not exist

- **WHEN** the store gets `set-field` for a reference field with an entity ID that no entity has
- **THEN** the store refuses the input with a problem that names the ID, and the part is the same object as before

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

### Requirement: A value that does not change keeps the part

When `set-field` holds the value that the field holds now, the store SHALL accept the input and SHALL give the same part object. Two values SHALL be the same when they have the same JSON type and the same JSON value. Two lists SHALL be the same when they hold the same items in the same order.

#### Scenario: The same value

- **WHEN** the store gets `set-field` with the value that the field holds, for a field of each of the five types
- **THEN** the hub accepts the input, and the part is the same object as before

#### Scenario: A number and its text

- **WHEN** a number field holds `3`, and the store gets `set-field` with the value `"3"`
- **THEN** the store refuses the input, and the part is the same object as before

#### Scenario: An equal list in a new object

- **WHEN** a `reference-list` field holds the IDs of `goat` and `owl`, and the store gets `set-field` with a new list of the IDs of `goat` and `owl`
- **THEN** the hub accepts the input, and the part is the same object as before

#### Scenario: The same IDs in a different order

- **WHEN** a `reference-list` field holds the IDs of `goat` and `owl`, and the store gets `set-field` with the IDs of `owl` and `goat`
- **THEN** the part holds the IDs of `owl` and `goat` in that order

### Requirement: An input clears a field value

The input `clear-field` SHALL hold the ID of an entity, the ID of a component type, and the ID of a field. The store SHALL remove the value of that field from the component of the entity. The component SHALL stay in the entity, also when it then holds no value. Each other value SHALL stay. The store SHALL refuse the input when the entity does not exist, when the component type is not defined, or when the field is not a field of the component type.

#### Scenario: A count is cleared

- **WHEN** the sample entity has the count `0`, and the store gets `clear-field` for the field `count` of its `Counter` component
- **THEN** the `Counter` component of the entity holds no key `count`, the entity still has the `Counter` component, and its `Color` component is the same object as before

#### Scenario: The last value of a component

- **WHEN** a component holds one value, and the store gets `clear-field` for that field
- **THEN** the entity has that component with no value, and the model is correct

#### Scenario: A reference is cleared before the removal of its entity

- **WHEN** a reference field of the entity `list` names the entity `task`, the store gets `clear-field` for that field, and then `remove-entity` for `task`
- **THEN** the store accepts the two inputs, and the part holds only `list`

#### Scenario: An entity that does not exist

- **WHEN** the store gets `clear-field` with an entity ID that no entity has
- **THEN** the store refuses the input with a problem at the path `payload`, `entity` that names the ID, and the part is the same object as before

#### Scenario: A component type that is not defined

- **WHEN** the store gets `clear-field` with a component type ID that no definition has
- **THEN** the store refuses the input with a problem at the path `payload`, `componentType` that names the ID

#### Scenario: A field of a different component type

- **WHEN** the store gets `clear-field` with a field ID that is not a field of the named component type
- **THEN** the store refuses the input with a problem at the path `payload`, `field` that names the field

#### Scenario: A payload with a missing key

- **WHEN** the store gets `clear-field` with a payload that has no string `field` key
- **THEN** the store refuses the input with a problem at the path `payload`, `field`

#### Scenario: A rewind restores the value

- **WHEN** a hub with a store applies `clear-field` for the count, and then `hub/rewind` to the sequence number before that input
- **THEN** the part holds the count again, and it is equal to the part before the `clear-field`

### Requirement: A clear of a value that does not exist keeps the part

When the component of the entity has no value for the field, or the entity has no component of the type, the store SHALL accept `clear-field` and SHALL give the same part object. The entity SHALL NOT get a component of that type.

#### Scenario: A field with no value

- **WHEN** the store gets `clear-field` for a field that has no value
- **THEN** the hub accepts the input, and the part is the same object as before

#### Scenario: A component that the entity does not have

- **WHEN** an entity has no `AppBar` component, and the store gets `clear-field` for the `title` field of `AppBar` on that entity
- **THEN** the hub accepts the input, the part is the same object as before, and the entity has no `AppBar` component

#### Scenario: Two clears

- **WHEN** the store gets `clear-field` for the count two times
- **THEN** the hub accepts the two inputs, and the part after the second input is the same object as the part after the first input

### Requirement: An input adds a reference to a list

The input `add-reference` SHALL hold the ID of an entity, the ID of a component type, the ID of a `reference-list` field of that component type, and the entity ID `reference`. The store SHALL add `reference` at the end of the list. When the component or the field has no value, the store SHALL set the list with that one ID. When the list holds `reference`, the store SHALL accept the input and SHALL give the same part object.

#### Scenario: A third card

- **WHEN** the `cards` field of `deck` holds the IDs of `goat` and `owl`, and the store gets `add-reference` with the ID of `wolf`
- **THEN** the field holds the IDs of `goat`, `owl`, and `wolf` in that order, and each other entity is the same object as before

#### Scenario: A field with no value

- **WHEN** the component of `deck` omits the `cards` field, and the store gets `add-reference` with the ID of `goat`
- **THEN** the field holds the list of the one ID of `goat`

#### Scenario: An ID that the list holds

- **WHEN** the `cards` field of `deck` holds the ID of `goat`, and the store gets `add-reference` with the ID of `goat`
- **THEN** the hub accepts the input, and the part is the same object as before

### Requirement: An input removes a reference from a list

The input `remove-reference` SHALL hold the same keys as `add-reference`. The store SHALL remove `reference` from the list, and SHALL keep the order of the other items. A list with no item after the removal SHALL stay as `[]`. When the list does not hold `reference`, or the field has no value, the store SHALL accept the input and SHALL give the same part object.

#### Scenario: A card is removed

- **WHEN** the `cards` field of `deck` holds the IDs of `goat`, `owl`, and `wolf`, and the store gets `remove-reference` with the ID of `owl`
- **THEN** the field holds the IDs of `goat` and `wolf` in that order

#### Scenario: The last card is removed

- **WHEN** the `cards` field of `deck` holds only the ID of `goat`, and the store gets `remove-reference` with the ID of `goat`
- **THEN** the field holds `[]`

#### Scenario: An ID that the list does not hold

- **WHEN** the `cards` field of `deck` does not hold the ID of `wolf`, and the store gets `remove-reference` with the ID of `wolf`
- **THEN** the hub accepts the input, and the part is the same object as before

### Requirement: The store refuses a list input that it cannot apply

The store SHALL refuse `add-reference` and `remove-reference` when a key of the payload is not a string, when the entity does not exist, when the component type is not defined, when the field is not a field of the component type, or when the field does not have the type `reference-list`. The store SHALL refuse `add-reference` when `reference` is not the ID of an entity of the model. Each problem SHALL name the key of the payload or the place in the model.

#### Scenario: A field of a different type

- **WHEN** the store gets `add-reference` for the `string` field `name` of `deck`
- **THEN** the store refuses the input with a problem that names the field and the type `reference-list`, and the part is the same object as before

#### Scenario: An ID that no entity has

- **WHEN** the store gets `add-reference` with the ID `e_00000000-0000-4000-8000-000000000000`, and no entity has that ID
- **THEN** the store refuses the input with a problem that names the ID, and the part is the same object as before

#### Scenario: A payload with no reference

- **WHEN** an input subsystem sends `store/remove-reference` with a payload that has no `reference` key
- **THEN** the result of the hub is a rejection with the reason `invalid` and a problem whose path is `payload` and `reference`
