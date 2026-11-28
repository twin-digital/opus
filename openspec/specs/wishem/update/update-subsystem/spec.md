# wishem/update/update-subsystem Specification

## Purpose

Defines the update subsystem of Wishem: the one model subsystem that runs the native behaviors of a construct at each tick, the contract of a native behavior, and the order in which the behaviors run, so that each rule of a tick has one owner (rule R22).

## Requirements

### Requirement: The update subsystem wraps the store one time

The package `@thrashplay/wishem-update` SHALL make the update subsystem from one store and one list of native behaviors. The update subsystem SHALL be a model subsystem with the ID of the store and its first part. It SHALL apply each input type of the store as the store does, and also `time/advance`. A construct SHALL have one update subsystem.

#### Scenario: An input of the store

- **WHEN** a hub has the time subsystem and the update subsystem of a store, and an input subsystem sends `store/set-field` with a correct value
- **THEN** the part `store` holds the value, as with the store alone

#### Scenario: An input that the store refuses

- **WHEN** an input subsystem sends `store/set-field` for an entity that does not exist
- **THEN** the hub refuses the input with the reason `invalid`, as with the store alone

#### Scenario: A store with a different ID

- **WHEN** the update subsystem wraps a store with the ID `product`
- **THEN** the update subsystem has the ID `product`, and its input types are the input types of that store and `time/advance`

### Requirement: A native behavior acts on one component type

A native behavior SHALL have an ID, the ID of one component type, and a function `update`. `update` SHALL get the fields of one component and the tick, and SHALL return the new fields. The tick SHALL hold `ms`, the length of the tick from the payload of `time/advance`, and `ticks` and `now` of the part `time` after the tick. The update subsystem SHALL write each field of the result whose value differs from the current value. A field that the result does not hold SHALL keep its value.

#### Scenario: One behavior and three entities

- **WHEN** a behavior for `Counter` adds 1 to `count`, the store holds two entities with a `Counter` component and one entity with no `Counter` component, and the hub applies one tick
- **THEN** each `count` is 1 more, and the entity with no `Counter` component does not change

#### Scenario: The tick

- **WHEN** a behavior writes `ticks`, `now`, and `ms` of its tick into three number fields, and the hub applies two ticks of 50 milliseconds
- **THEN** the fields hold `2`, `100`, and `50`

### Requirement: The behaviors run in the order of the list

At each tick, the update subsystem SHALL run the behaviors in the order of the list. For each behavior, it SHALL run the behavior for each entity that has the component type of the behavior, in the order of the entities in the store. Each behavior SHALL get the fields after the writes of the behaviors that ran before it in the same tick.

#### Scenario: Two behaviors on one field

- **WHEN** the list holds a behavior that doubles `count` and then a behavior that adds 1 to `count`, the count is `3`, and the hub applies one tick
- **THEN** the count is `7`

#### Scenario: The same behaviors in the other order

- **WHEN** the list holds the behavior that adds 1 first and the behavior that doubles second, the count is `3`, and the hub applies one tick
- **THEN** the count is `8`

### Requirement: A tick that changes nothing keeps the part

When no behavior changes a field value in a tick, the update subsystem SHALL return the same part object.

#### Scenario: No behavior

- **WHEN** the list of behaviors is empty, and the hub applies one tick
- **THEN** the part of the store is the same object as before, and the part `time` has one more tick

#### Scenario: A behavior that returns the same values

- **WHEN** a behavior returns its fields with no change, and the hub applies one tick
- **THEN** the part of the store is the same object as before

### Requirement: A fault of a behavior refuses the tick

When a behavior throws an error, or when the store refuses a value that a behavior returns, the update subsystem SHALL refuse the tick. The hub SHALL then refuse the input with the reason `invalid`, and each problem SHALL name the ID of the behavior and the ID of the entity. No part SHALL change. When the joined state has no part `time`, the update subsystem SHALL refuse the tick.

#### Scenario: A behavior throws

- **WHEN** a behavior with the ID `boom` throws an error, and an input subsystem sends one tick
- **THEN** the result is `invalid`, a problem names `boom` and the entity, and the parts `time` and `store` do not change

#### Scenario: A value of the wrong type

- **WHEN** a behavior writes the text `"x"` into a field of the type `number`, and an input subsystem sends one tick
- **THEN** the result is `invalid`, a problem names the behavior, the entity, and the field, and the part `store` does not change

#### Scenario: No part time

- **WHEN** a hub has the update subsystem and no time subsystem, and an input subsystem sends `time/advance`
- **THEN** the result is `invalid`, and a problem names the part `time`

### Requirement: The list of behaviors is checked

The update subsystem SHALL refuse to start from a list in which an item has no text ID, no text component type ID, or no function `update`, or in which two behaviors have the same ID. The error SHALL name the position or the ID of the item.

#### Scenario: Two behaviors with one ID

- **WHEN** a person makes the update subsystem with two behaviors that have the ID `count`
- **THEN** the call throws an error that names `count`

#### Scenario: An item with no function

- **WHEN** a person makes the update subsystem with a list whose second item has no function `update`
- **THEN** the call throws an error that names the position 1

### Requirement: The behaviors follow the record

The state after the behaviors SHALL depend only on the first state and the inputs of the record. A replay and a rewind SHALL give the same state as the first run.

#### Scenario: A replay

- **WHEN** a hub with the time subsystem and the update subsystem applies five ticks, and a new hub with the same subsystems replays its record
- **THEN** the part of the store of the new hub is equal to the part of the first hub

#### Scenario: A rewind

- **WHEN** a hub applies five ticks with a behavior that adds 1 to `count` from `0`, and then `hub/rewind` returns to the state after the second tick
- **THEN** the count is `2`

### Requirement: The update package uses no Node.js API

The package `@thrashplay/wishem-update` SHALL use no Node.js API and SHALL compile with no Node.js types. The package SHALL be private.

#### Scenario: A source file imports a Node.js module

- **WHEN** a source file of the package imports `node:path`
- **THEN** the build of the package fails
