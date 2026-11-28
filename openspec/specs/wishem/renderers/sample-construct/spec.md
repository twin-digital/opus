# wishem/renderers/sample-construct Specification

## Purpose

Defines the sample construct: the one construct of the sample product that the React page, the PixiJS page, and the Godot application draw at the same time, and the command that starts and stops it.

## Requirements

### Requirement: The sample construct runs in its own Node.js process

The sample construct SHALL be a product construct of the sample product, in a Node.js process of its own. It SHALL NOT use the hub or the process of the workbench. It SHALL have the model subsystems `time` and `store`, the clock as an input subsystem, and no storage subsystem. The process SHALL serve the link at `/link` on `127.0.0.1`, with the rules of `wishem/host-nodejs/server`.

#### Scenario: A client of the link

- **WHEN** the process runs and a client opens a link at `ws://127.0.0.1:4750/link` with one output subsystem
- **THEN** the client gets `welcome`, and the joined state has the parts `time` and `store`

#### Scenario: Three clients at the same time

- **WHEN** three clients open a link to the process at the same time
- **THEN** each client gets `welcome`, and after one tick each client gets the same `applied` event with the same `seq`

#### Scenario: The workbench runs at the same time

- **WHEN** the workbench runs on its ports and the process of the sample construct starts
- **THEN** both start, and the link of each one gives its own joined state

### Requirement: The sample construct starts from the model folder of the sample product

The process SHALL read the model folder of the sample product at each start, and the store SHALL start from that model at tick 0. The store SHALL run the behaviors of the sample product. The process SHALL write no file.

#### Scenario: The first state

- **WHEN** the process starts
- **THEN** the part `time` has `ticks` 0, the color of the sample entity is `#1d4ed8`, and its count is `0`

#### Scenario: One tick

- **WHEN** the process runs at tick 0 and a client of the link sends `time/advance` with 500
- **THEN** the color of the sample entity is `#b91c1c`, and its count is `1`

#### Scenario: A start after a stop

- **WHEN** the construct applied ticks, the process stops, and the process starts again
- **THEN** the part `time` has `ticks` 0, and the color is `#1d4ed8`

#### Scenario: No file changes

- **WHEN** the construct runs and applies ticks
- **THEN** the `state.json` of the model folder of the sample product does not change

### Requirement: The clock of the sample construct

The clock SHALL send a tick of 500 milliseconds for each 500 milliseconds of real time while `running` is `true` in the part `time`. It SHALL send no tick while `running` is `false`. A client of the link SHALL change `running` with `time/set-running`.

#### Scenario: The construct runs

- **WHEN** the process runs with `running` set to `true` and 500 milliseconds of real time pass
- **THEN** the hub applies one `time/advance` of 500 milliseconds from the source `clock`

#### Scenario: A client pauses the construct

- **WHEN** a client of the link sends `time/set-running` with `false`
- **THEN** the clock sends no more ticks

### Requirement: A command starts the sample construct

The command `pnpm --filter @thrashplay/wishem-three-renderers construct` SHALL start the sample construct with its link on port 4750 of `127.0.0.1`, and SHALL print the address of the link. The option `--hub-port` SHALL change the port, and 0 SHALL let the system select one. With the option `--paused`, the time SHALL start with `running` set to `false`, and the command SHALL print `wishem: the time of the construct starts paused`.

#### Scenario: The person starts the command

- **WHEN** a person runs the command with no option
- **THEN** the terminal shows `wishem: link at ws://127.0.0.1:4750/link`

#### Scenario: The construct starts paused

- **WHEN** a person runs the command with `--paused` and waits two seconds
- **THEN** the part `time` has `ticks` 0 and `running` set to `false`

#### Scenario: The port is in use

- **WHEN** a different program uses port 4750 and a person runs the command
- **THEN** the terminal shows `wishem: port 4750 is in use`, no clock runs, and the command ends with exit code 1

#### Scenario: A port that is not a number

- **WHEN** a person runs the command with `--hub-port many`
- **THEN** the terminal shows `wishem: --hub-port must be a number from 0 to 65535`, and the command ends with exit code 1

### Requirement: The command stops the sample construct

On `SIGINT` or `SIGTERM`, the command SHALL stop the clock and the hub, so that each open link gets the `stopping` event, release the port, and end with exit code 0. A second stop request SHALL do nothing.

#### Scenario: Ctrl+C with three links

- **WHEN** the React page, the PixiJS page, and the Godot application each have a link, and the person presses Ctrl+C
- **THEN** each link gets `stopping` and closes, the command ends with exit code 0, and a new start can use the same port

### Requirement: A color of the sample construct is #rrggbb

A value of the field `color` of the component type `Color` SHALL be a color when it is text of the form `#rrggbb`: `#` and six hexadecimal digits, in upper case or lower case. Each other value SHALL NOT be a color. The `ClearColor` view of the React page, of the PixiJS page, and of the Godot application SHALL each fill the full viewport with a color value, with no transparency.

#### Scenario: A color in lower case

- **WHEN** the color of the sample entity is `#1d4ed8`
- **THEN** each pixel of the picture of each of the three renderers is `#1d4ed8`

#### Scenario: A color in upper case

- **WHEN** the color of the sample entity is `#1D4ED8`
- **THEN** each pixel of the picture of each of the three renderers is `#1d4ed8`

#### Scenario: Other forms of a color in CSS

- **WHEN** the color of the sample entity is `red`, `rgb(29, 78, 216)`, `transparent`, `#fff`, or `#1d4ed880`
- **THEN** the value is not a color

#### Scenario: No hash sign

- **WHEN** the color of the sample entity is `1d4ed8`
- **THEN** the value is not a color

### Requirement: The three renderers draw one fallback color

For no value of the field `color`, and for a value that is not a color, the `ClearColor` view of the React page, of the PixiJS page, and of the Godot application SHALL fill the full viewport with the fallback color `#ff00ff`. A field whose label gives an empty name gives no prop, so the view SHALL draw the fallback color for it too. No view SHALL be hidden, and no error SHALL occur.

#### Scenario: No value

- **WHEN** the `Color` component of the sample entity has no value for the field `color`
- **THEN** each pixel of the picture of each of the three renderers is `#ff00ff`

#### Scenario: A value that is not a color

- **WHEN** the color of the sample entity is `red`
- **THEN** each pixel of the picture of each of the three renderers is `#ff00ff`

#### Scenario: A label that gives an empty name

- **WHEN** the label of the field `color` is `???`
- **THEN** no view gets the prop `color`, and each pixel of the picture of each of the three renderers is `#ff00ff`

#### Scenario: A color after a value that is not a color

- **WHEN** the color of the sample entity is `red` and then `#15803d`
- **THEN** each pixel of the picture of each of the three renderers is `#15803d`

### Requirement: One table of color cases

The package `@thrashplay/wishem-sample-product` SHALL export a table of color cases and the fallback color from its subpath `color-cases`. Each case SHALL hold a name, a value or no value, and the color in lower case that a view draws for it. The table SHALL hold each value of the scenarios of "A color of the sample construct is #rrggbb", no value, and each color of the color behavior. The tests of each of the three `ClearColor` views SHALL check each case.

#### Scenario: The colors of the color behavior

- **WHEN** a test reads the table
- **THEN** each color of the color behavior is a case that gives the same color

#### Scenario: A renderer that does not follow the rule

- **WHEN** the view of one renderer draws a different color for one case of the table
- **THEN** a unit test of the package of that view fails

#### Scenario: The copy of the table for Godot

- **WHEN** the JSON copy of the table in `renderer-godot` differs from the table of the sample product
- **THEN** a unit test of `renderer-godot` fails
