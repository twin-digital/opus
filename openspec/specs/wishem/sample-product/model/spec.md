# wishem/sample-product/model Specification

## Purpose

Defines the sample product of Wishem: a small authored model with a color and a count, and the rule that makes the clock advance the count, so that the workbench, the construct manager, and the renderers have one product to mount, run, and draw.

## Requirements

### Requirement: The sample product has a model folder

The package `@thrashplay/wishem-sample-product` SHALL hold a model folder `model/`. The model SHALL hold the component type `Color` with one string field `color`, the component type `Counter` with one number field `count`, and one entity with a `Color` component and a `Counter` component. The first values SHALL be the text `#1d4ed8` and the number `0`. The model SHALL be correct and SHALL have no warning.

#### Scenario: Validate the model

- **WHEN** a test validates the two definition files and `state.json` of `model/`
- **THEN** the model is correct, has no warning, has the labels `Color` and `Counter`, and has one entity with the color `#1d4ed8` and the count `0` as a number

#### Scenario: Start the sample product alone

- **WHEN** a person runs `wishem start nodejs/wishem/sample-product/model`
- **THEN** the command prints `wishem: 2 component types, 1 entity`

#### Scenario: A count that is text

- **WHEN** a person changes the count in `state.json` of a copy of the model folder to the text `"8"`
- **THEN** the model is not correct, and the problem names the field `count` of `Counter` and the type `number`

### Requirement: The IDs of the sample product do not change

The root entry of the package SHALL export the IDs of the two component types, of their fields, and of the entity. The IDs SHALL be the IDs in the model folder.

#### Scenario: An ID in code and in the folder

- **WHEN** a test compares the exported ID of the component type `Counter` with the ID in its definition file
- **THEN** the two IDs are equal

### Requirement: A tick adds 1 to each count

The package SHALL give the count behavior: a native behavior for the component type `Counter`, which the update subsystem runs. At each tick, it SHALL add 1 to the `count` value of each `Counter` component when the value is a number. It SHALL NOT change a value that is not a number. It SHALL NOT refuse a tick.

#### Scenario: Three ticks

- **WHEN** a hub has the time subsystem first and the update subsystem of the sample store with the count behavior second, and it gets three ticks
- **THEN** the count of the sample entity is the number `3`

#### Scenario: A count that a person set

- **WHEN** the count is `41`, and the hub gets one tick
- **THEN** the count is `42`

#### Scenario: A count that is not an integer

- **WHEN** the count is `1.5`, and the hub gets one tick
- **THEN** the count is `2.5`

#### Scenario: A count that is not a number

- **WHEN** the definition of `Counter` gives `count` the type `string`, the count is `many`, and the hub gets one tick
- **THEN** the hub accepts the tick, the count stays `many`, and the part `time` has one more tick

#### Scenario: A tick with no counter

- **WHEN** no entity has a `Counter` component, and the hub gets one tick
- **THEN** the part of the store is the same object as before

#### Scenario: An input of the store

- **WHEN** the update subsystem with the count behavior gets `store/set-field` that sets the color to `#15803d`
- **THEN** the part holds `#15803d`, as with the store alone

### Requirement: The count follows the record

The count SHALL depend only on the inputs of the record. A rewind and a replay SHALL give the same counts as the first run.

#### Scenario: A replay

- **WHEN** a hub with the time subsystem and the update subsystem with the count behavior gets five ticks, and a new hub replays its record
- **THEN** the new hub has the same count

#### Scenario: A rewind

- **WHEN** a hub gets five ticks, and then `hub/rewind` returns to the state after the second tick
- **THEN** the count is `2`

#### Scenario: The clock advances the count

- **WHEN** a clock with a step length of 100 milliseconds starts on a hub with the time subsystem and the update subsystem with the count behavior, and 500 milliseconds of real time pass
- **THEN** the count is `5`

### Requirement: The sample product package uses no Node.js API

The root entry of the package SHALL use no Node.js API and SHALL compile with no Node.js types. The package SHALL be private.

#### Scenario: A source file imports a Node.js module

- **WHEN** a source file of the package imports `node:path`
- **THEN** the build of the package fails

### Requirement: The root entry exports the behaviors of the product

The root entry of the package SHALL export the list `behaviors`, which holds the count behavior. It SHALL be the one export that a product construct needs from the code of the product. The list SHALL import nothing of the workbench.

#### Scenario: The construct manager loads the behaviors

- **WHEN** the workbench names `@thrashplay/wishem-sample-product` as the product code, and a product construct gets three ticks
- **THEN** the count of the sample entity is three more than the count at the start

#### Scenario: The list

- **WHEN** a test reads `behaviors` of the root entry
- **THEN** the list holds one behavior, the count behavior, for the component type `Counter`
