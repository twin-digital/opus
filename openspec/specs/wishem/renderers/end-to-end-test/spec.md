# wishem/renderers/end-to-end-test Specification

## Purpose

Defines the test that proves that the React renderer, the PixiJS renderer, and the Godot renderer draw the same hub at the same time, and that each picture follows the clock of that hub.

## Requirements

### Requirement: The test runs the sample construct and the three renderers as real processes

The command `pnpm --filter @thrashplay/wishem-three-renderers test:ui` SHALL start the command of the sample construct paused, the command of the React page, the command of the PixiJS page, and the Godot application through the Godot runner, each as a real process. The two pages SHALL open in one pinned web browser in Docker. The three renderers SHALL connect to the one link of the sample construct.

#### Scenario: The test runs on a computer with Docker

- **WHEN** a person runs the command on a computer with Docker
- **THEN** the test starts the four processes and the browser, and passes

#### Scenario: Docker is not available

- **WHEN** Docker is not available
- **THEN** the command stops with exit code 1 and a message that says that the test needs Docker

#### Scenario: The test ends

- **WHEN** the test passes or fails
- **THEN** each process that it started has stopped, and `docker ps -a` shows no container of the Godot runner and no container of the browser

### Requirement: Each picture shows the same state of the hub

At each check, the test SHALL read the joined state of the sample construct through a link of its own. Each pixel of the picture of each renderer SHALL be the color that the requirement "A color of the sample construct is #rrggbb" of `wishem/renderers/sample-construct` gives for the color of the sample entity in that state, or the fallback color `#ff00ff` when that state has no color.

#### Scenario: The first picture

- **WHEN** the three renderers connect to the paused construct at tick 0
- **THEN** each pixel of the picture of each renderer is `#1d4ed8`

#### Scenario: One renderer draws a different hub

- **WHEN** one renderer connects to a different construct
- **THEN** the test fails at the check of that renderer after the step

### Requirement: Each picture changes when the time advances

The test SHALL send one `time/advance` of 500 milliseconds through its link. Then each picture SHALL be `#b91c1c` and SHALL differ from the first picture. Then the test SHALL send `time/set-running` with `true`. Each picture SHALL change again within 5 seconds. Then the test SHALL send `time/set-running` with `false`, read the joined state, and check that each picture has the color of that state.

#### Scenario: One step

- **WHEN** the test sends one `time/advance`
- **THEN** each pixel of each picture is `#b91c1c`

#### Scenario: The clock advances

- **WHEN** the test sends `time/set-running` with `true`
- **THEN** within 5 seconds each picture has a color that is not `#b91c1c`

#### Scenario: The clock pauses

- **WHEN** the test sends `time/set-running` with `false` and reads the joined state with `ticks` equal to `t`
- **THEN** within 2 seconds each picture has the color at the position `t` modulo 4 of the list `#1d4ed8`, `#b91c1c`, `#15803d`, `#a16207`

#### Scenario: The renderer does not follow the store

- **WHEN** one renderer does not draw again after a new part `store`
- **THEN** the test fails at the check of that renderer after the step

### Requirement: Each picture stays the same while the time is paused

After the step and after the pause, the test SHALL wait 1500 milliseconds. The picture of each page SHALL be equal, byte for byte, to the picture before the wait. The Godot application SHALL write no new screenshot in the wait.

#### Scenario: The construct is paused

- **WHEN** the construct is paused and the test waits 1500 milliseconds
- **THEN** the screenshot of each page is equal to the screenshot before the wait, and the Godot runner shows no new `shot` line

#### Scenario: The clock does not stop

- **WHEN** the clock sends ticks while `running` is `false`
- **THEN** the test fails at the check of the wait

### Requirement: Each picture shows the fallback color when the state has no color

While the construct is paused, the test SHALL send these inputs through its link, in this order: `store/set-field` with `red`, `store/set-field` with `#15803d`, `store/replace-model` with no value for the field `color`, `store/replace-model` with `#15803d` and a valid label, and `store/replace-model` with the label `???`. After each input, each pixel of each picture SHALL be `#ff00ff`, except after an input with `#15803d`.

#### Scenario: A value that is not a color

- **WHEN** the test sets the color to `red`
- **THEN** within 5 seconds each pixel of each picture is `#ff00ff`

#### Scenario: A color again

- **WHEN** the test then sets the color to `#15803d`
- **THEN** within 5 seconds each pixel of each picture is `#15803d`

#### Scenario: No value

- **WHEN** the test replaces the model with a model whose `Color` component has no value for the field `color`
- **THEN** within 5 seconds each pixel of each picture is `#ff00ff`

#### Scenario: A color again before the last step

- **WHEN** the test replaces the model with a model that has a valid label and the value `#15803d`
- **THEN** within 5 seconds each pixel of each picture is `#15803d`, so that the next step starts from a different color

#### Scenario: A label that gives an empty name

- **WHEN** the test replaces the model with a model in which the label of the field `color` is `???` and the value is `#1d4ed8`
- **THEN** within 5 seconds each pixel of each picture is `#ff00ff`

#### Scenario: One renderer hides its view

- **WHEN** one renderer draws nothing for a value that is not a color
- **THEN** the test fails at the check of that renderer
