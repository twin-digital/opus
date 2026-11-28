# wishem/renderer-pixi/construct Specification

## Purpose

Defines the construct of the PixiJS page and the Node.js process that runs it: the model, the color rule, the clock, the link that the page reads, and the command that starts and stops it.

## Requirements

### Requirement: The construct runs in a Node.js process

The construct of the PixiJS page SHALL be its own construct. It SHALL NOT use the hub or the process of the workbench. Its hub SHALL run in a Node.js process, with the `time` subsystem and the store as model subsystems, and with the clock as an input subsystem. The process SHALL serve the link of the hub at `/link` on `127.0.0.1`, with the rules of `wishem/host-nodejs/server`.

#### Scenario: A client of the link

- **WHEN** the process runs and a client opens a link at `ws://127.0.0.1:4748/link` with one output subsystem
- **THEN** the client gets `welcome`, and the joined state has the parts `time` and `store`

#### Scenario: The workbench runs at the same time

- **WHEN** the workbench runs on its ports and the process of the PixiJS construct starts
- **THEN** both start, and the link of each one gives its own joined state

### Requirement: The model of the construct has one clear-color entity

The model of the construct SHALL be in code, with no storage subsystem. It SHALL have one component type `Clear color` with one field `Color` of the type `string`, and one entity with a `Clear color` component. The first value of the field SHALL be the first color of the color rule. Each start of the process SHALL start from this model at tick 0.

#### Scenario: The first state

- **WHEN** the process starts
- **THEN** the part `time` has `ticks` 0, and the `Color` field has the first color of the list

#### Scenario: A start after a stop

- **WHEN** the construct applied ticks, the process stops, and the process starts again
- **THEN** the part `time` has `ticks` 0, and the `Color` field has the first color of the list

### Requirement: The color rule follows the count of ticks

The update subsystem of the construct SHALL wrap the store and SHALL run the color behavior: a native behavior for the component type `Clear color`. For each tick, the color behavior SHALL set the `Color` field to the color at the position `ticks` modulo the number of colors, in a list of four different colors. The behavior SHALL be a pure function of the fields and the tick, so that the same record gives the same colors.

#### Scenario: One tick

- **WHEN** the construct is at tick 0 and the hub applies one `time/advance`
- **THEN** the `Color` field has the second color of the list

#### Scenario: Four ticks

- **WHEN** the hub applies four `time/advance` inputs from tick 0
- **THEN** the `Color` field has the first color of the list again

#### Scenario: The same record

- **WHEN** a second construct with the same model subsystems applies the record of the first construct
- **THEN** its part `store` is equal to the part `store` of the first construct

#### Scenario: A rewind

- **WHEN** the construct applied three ticks from tick 0, and a client of the link sends `hub/rewind` with the target 1
- **THEN** the `Color` field has the second color of the list, and the part `time` has `ticks` 1

#### Scenario: The record holds only the ticks

- **WHEN** the construct applied two ticks from the clock
- **THEN** the record holds two `time/advance` inputs and no input of the store

### Requirement: The clock of the construct

The clock SHALL send a tick of 500 milliseconds for each 500 milliseconds of real time while `running` is `true` in the part `time`. It SHALL send no tick while `running` is `false`.

#### Scenario: The construct runs

- **WHEN** the process runs with `running` set to `true` and 500 milliseconds of real time pass
- **THEN** the hub applies one `time/advance` from the source `clock`

#### Scenario: A client pauses the construct

- **WHEN** a client of the link sends `time/set-running` with `false`
- **THEN** the clock sends no more ticks

### Requirement: A command starts the construct and the page server

The command `pnpm --filter @thrashplay/wishem-pixi-page start` SHALL start the construct with its link on port 4748 and the page server on port 5174, each on `127.0.0.1`, and SHALL print the address of the link and of the page. The options `--hub-port` and `--port` SHALL change the two ports, and 0 SHALL let the system select one.

#### Scenario: The person starts the command

- **WHEN** a person runs the command in a new checkout after `pnpm install` and `pnpm build --filter "@thrashplay/wishem-pixi-page..."`
- **THEN** the terminal shows `wishem: link at ws://127.0.0.1:4748/link` and `wishem: PixiJS page at http://127.0.0.1:5174/`

#### Scenario: A port is in use

- **WHEN** a different process uses port 4748, and the person runs the command
- **THEN** the command writes `wishem: port 4748 is in use`, starts no clock and no page server, and ends with exit code 1

### Requirement: The construct can start paused

With the option `--paused`, the `time` subsystem SHALL start with `running` set to `false`, and the command SHALL print `wishem: the time of the construct starts paused`. Without the option, it SHALL start with `running` set to `true`.

#### Scenario: The option is given

- **WHEN** the person starts the command with `--paused` and waits two seconds
- **THEN** the part `time` has `ticks` 0 and `running` set to `false`

### Requirement: The command stops the construct and the page server together

On Ctrl+C or `SIGTERM`, the command SHALL stop the clock, stop the hub so that each open link (also a link through the page server) gets the `stopping` event, stop the page server, release each port, and end with exit code 0. A second stop request SHALL do nothing.

#### Scenario: Stop with an open link

- **WHEN** a page has an open link and the person presses Ctrl+C
- **THEN** the link gets the `stopping` event and closes, the command ends with exit code 0, and a new start can use the same ports
