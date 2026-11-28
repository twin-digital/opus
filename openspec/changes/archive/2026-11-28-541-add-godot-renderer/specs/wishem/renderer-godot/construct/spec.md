# Spec Delta

## Purpose

Defines the construct that the Godot application draws and the Node.js process that runs it: the model, the color rule, the clock, the link, and the command that starts and stops it.

## ADDED Requirements

### Requirement: The construct runs in a Node.js process

The construct of the Godot application SHALL be its own construct. It SHALL NOT use the hub of the workbench or of the PixiJS page. Its hub SHALL run in a Node.js process with the `time` subsystem and the store as model subsystems, and the clock as an input subsystem. The process SHALL serve the link at `/link` on `127.0.0.1`, with the rules of `wishem/host-nodejs/server`.

#### Scenario: A client of the link

- **WHEN** the process runs and a client opens a link at `ws://127.0.0.1:4749/link` with one output subsystem
- **THEN** the client gets `welcome`, and the joined state has the parts `time` and `store`

#### Scenario: The PixiJS page runs at the same time

- **WHEN** the command of the PixiJS page runs on its ports and the process of this construct starts
- **THEN** both start, and the link of each one gives its own joined state

### Requirement: The model of the construct has one clear-color entity

The model SHALL be in code, with no storage subsystem. It SHALL have one component type `Clear color` with one field `Color` of the type `string`, and one entity with a `Clear color` component. The first value of the field SHALL be the first color of the color rule. Each start SHALL start from this model at tick 0.

#### Scenario: A start after a stop

- **WHEN** the construct applied ticks, the process stops, and the process starts again
- **THEN** the part `time` has `ticks` 0, and the `Color` field has the first color of the list

### Requirement: The color rule follows the count of ticks

A model subsystem SHALL apply each input of the store and `time/advance`. For each tick, it SHALL set the `Color` field to the color at the position `ticks` modulo 4 in the list `#1d4ed8`, `#b91c1c`, `#15803d`, `#a16207`. The rule SHALL be a pure function of the parts `store` and `time`.

#### Scenario: One tick

- **WHEN** the construct is at tick 0 and the hub applies one `time/advance`
- **THEN** the `Color` field is `#b91c1c`

#### Scenario: A rewind

- **WHEN** the construct applied three ticks from tick 0, and a client of the link sends `hub/rewind` with the target 1
- **THEN** the `Color` field is `#b91c1c`, and the part `time` has `ticks` 1

#### Scenario: The same record

- **WHEN** a second hub with the same model subsystems applies the record of the first hub
- **THEN** its part `store` is equal to the part `store` of the first hub

### Requirement: The clock of the construct

The clock SHALL send a tick of 500 milliseconds for each 500 milliseconds of real time while `running` is `true`, and no tick while `running` is `false`.

#### Scenario: A client pauses the construct

- **WHEN** a client of the link sends `time/set-running` with `false`
- **THEN** the clock sends no more ticks

### Requirement: A command starts the construct

The command `pnpm --filter @thrashplay/wishem-renderer-godot start` SHALL start the construct with its link on port 4749 of `127.0.0.1` and print the address of the link. The option `--port` SHALL change the port, and 0 SHALL let the system select one. The option `--paused` SHALL start the time with `running` set to `false`.

#### Scenario: The person starts the command

- **WHEN** a person runs the command with no option
- **THEN** the terminal shows `wishem: link at ws://127.0.0.1:4749/link`

#### Scenario: The construct starts paused

- **WHEN** a person runs the command with `--paused`
- **THEN** the terminal shows `wishem: the time of the construct starts paused`, and the clock sends no tick

#### Scenario: The port is in use

- **WHEN** a different program uses port 4749 and a person runs the command
- **THEN** the terminal shows `wishem: port 4749 is in use`, no clock runs, and the command ends with exit code 1

### Requirement: The command stops the construct

On `SIGINT` or `SIGTERM`, the command SHALL stop the clock and the hub, so that each link gets `stopping`, release the port, and end with exit code 0.

#### Scenario: Ctrl+C

- **WHEN** a client has a link and the person presses Ctrl+C
- **THEN** the client gets `stopping`, the link ends, and the command ends with exit code 0
