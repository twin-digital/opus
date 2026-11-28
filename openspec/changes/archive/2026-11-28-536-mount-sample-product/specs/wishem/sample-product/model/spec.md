# Spec Delta

## Purpose

Defines the sample product of Wishem: a small authored model with a color and a count, and the rule that makes the clock advance the count, so that the workbench, the construct manager, and the renderers have one product to mount, run, and draw.

## ADDED Requirements

### Requirement: The sample product has a model folder

The package `@thrashplay/wishem-sample-product` SHALL hold a model folder `model/`. The model SHALL hold the component type `Color` with one string field `color`, the component type `Counter` with one string field `count`, and one entity with a `Color` component and a `Counter` component. The first values SHALL be `#1d4ed8` and `0`. The model SHALL be correct and SHALL have no warning.

#### Scenario: Validate the model

- **WHEN** a test validates the two definition files and `state.json` of `model/`
- **THEN** the model is correct, has no warning, has the labels `Color` and `Counter`, and has one entity with the color `#1d4ed8` and the count `0`

#### Scenario: Start the sample product alone

- **WHEN** a person runs `wishem start nodejs/wishem/sample-product/model`
- **THEN** the command prints `wishem: 2 component types, 1 entity`

### Requirement: The IDs of the sample product do not change

The root entry of the package SHALL export the IDs of the two component types, of their fields, and of the entity. The IDs SHALL be the IDs in the model folder.

#### Scenario: An ID in code and in the folder

- **WHEN** a test compares the exported ID of the component type `Counter` with the ID in its definition file
- **THEN** the two IDs are equal

### Requirement: A tick adds 1 to each count

The package SHALL give a count rule that wraps a store. The result SHALL be a model subsystem with the ID of the store. It SHALL apply each input type of the store as the store does, and also `time/advance`. For each `time/advance`, it SHALL add 1 to each `count` value that is a decimal integer with no sign and no leading zero. It SHALL NOT change a different value.

#### Scenario: Three ticks

- **WHEN** a hub has the time subsystem first and the sample store with the count rule second, and it gets three ticks
- **THEN** the count of the sample entity is `3`

#### Scenario: A count that a person set

- **WHEN** the count is `41`, and the hub gets one tick
- **THEN** the count is `42`

#### Scenario: A count that is not a number

- **WHEN** the count is `many`, and the hub gets one tick
- **THEN** the hub accepts the tick, the count stays `many`, and the part `time` has one more tick

#### Scenario: A tick with no counter

- **WHEN** no entity has a `Counter` component, and the hub gets one tick
- **THEN** the part of the store is the same object as before

#### Scenario: An input of the store

- **WHEN** the wrapped store gets `store/set-field` that sets the color to `#15803d`
- **THEN** the part holds `#15803d`, as with the store alone

### Requirement: The count follows the record

The count SHALL depend only on the inputs of the record. A rewind and a replay SHALL give the same counts as the first run.

#### Scenario: A replay

- **WHEN** a hub with the time subsystem and the wrapped store gets five ticks, and a new hub replays its record
- **THEN** the new hub has the same count

#### Scenario: A rewind

- **WHEN** a hub gets five ticks, and then `hub/rewind` returns to the state after the second tick
- **THEN** the count is `2`

#### Scenario: The clock advances the count

- **WHEN** a clock with a step length of 100 milliseconds starts on a hub with the time subsystem and the wrapped store, and 500 milliseconds of real time pass
- **THEN** the count is `5`

### Requirement: The sample product package uses no Node.js API

The root entry of the package SHALL use no Node.js API and SHALL compile with no Node.js types. The package SHALL be private.

#### Scenario: A source file imports a Node.js module

- **WHEN** a source file of the package imports `node:path`
- **THEN** the build of the package fails
