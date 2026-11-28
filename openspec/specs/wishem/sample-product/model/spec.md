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

The root entry of the package SHALL export the list `behaviors`, which holds the count behavior and then the color behavior. It SHALL be the one export that a product construct needs from the code of the product. The list SHALL import nothing of the workbench.

#### Scenario: The construct manager loads the behaviors

- **WHEN** the workbench names `@thrashplay/wishem-sample-product` as the product code, and a product construct gets three ticks
- **THEN** the count of the sample entity is three more than the count at the start, and the color is `#a16207`

#### Scenario: The list

- **WHEN** a test reads `behaviors` of the root entry
- **THEN** the list holds two behaviors: the count behavior for the component type `Counter`, and then the color behavior for the component type `Color`

### Requirement: A tick sets each color

The package SHALL give the color behavior: a native behavior for the component type `Color`, which the update subsystem runs. At each tick, it SHALL set the `color` field of each `Color` component to the color at the position `ticks` modulo 4 of the list `#1d4ed8`, `#b91c1c`, `#15803d`, `#a16207`. The first color of the list SHALL be the color of the model folder. The behavior SHALL be a pure function of the fields and the tick.

#### Scenario: One tick

- **WHEN** a hub has the time subsystem first and the update subsystem of the sample store with the behaviors of the sample product second, and it gets one tick
- **THEN** the color of the sample entity is `#b91c1c`

#### Scenario: Four ticks

- **WHEN** the hub gets four ticks from tick 0
- **THEN** the color of the sample entity is `#1d4ed8`

#### Scenario: A color that a person set

- **WHEN** an input `store/set-field` sets the color to `#000000` at tick 1, and the hub gets one tick
- **THEN** the color is `#15803d`

#### Scenario: A rewind

- **WHEN** a hub gets three ticks, and then `hub/rewind` returns to the state after the first tick
- **THEN** the color is `#b91c1c`, and the count is `1`

### Requirement: The sample product has React views

The folder `views/react/` of the sample product SHALL hold two React views, each with a sidecar of the kind `react`. The view `ClearColor` SHALL attach to the component type `Color` (`ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512`) and SHALL fill a box of 320 by 180 CSS pixels with the value of the prop `color`. The view `Count` SHALL attach to the component type `Counter` and SHALL show the text `Count <value>`. A view with no value SHALL draw nothing.

#### Scenario: The color

- **WHEN** the view `ClearColor` gets the prop `color` with `#1d4ed8`
- **THEN** it draws an element with the role `img`, the name `Color #1d4ed8`, and the background color `#1d4ed8`

#### Scenario: The count

- **WHEN** the view `Count` gets the prop `count` with `42`
- **THEN** it shows the text `Count 42`

#### Scenario: No value

- **WHEN** a view of the sample product gets no value for its field
- **THEN** it draws nothing, and no error occurs

#### Scenario: The sidecars

- **WHEN** the React renderer collects the views of `views/react/`
- **THEN** the table has one view for `Color` and one view for `Counter`, and no error

### Requirement: The views of the sample product are not in its root entry

The root entry of the sample product SHALL NOT import or export a view. The views SHALL use only React, the types of the React renderer, and the standard library.

#### Scenario: The root entry

- **WHEN** a package imports the root entry of the sample product
- **THEN** it loads no module of React
