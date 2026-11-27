# Spec Delta

## Purpose

Defines the PixiJS page: a page that holds a construct with a clock and draws it with the PixiJS renderer, so that a person and a test can see that the picture follows the time of the construct.

## ADDED Requirements

### Requirement: The page holds a construct with a clock

The PixiJS page SHALL be the private package `@thrashplay/wishem-pixi-page` in `nodejs/wishem/pixi-page`. The page SHALL make one hub in the web browser, with the store and the `time` subsystem as model subsystems. It SHALL attach three I/O subsystems: the clock, the keys, and the renderer. The clock SHALL send a tick of 500 milliseconds for each 500 milliseconds of real time while the construct runs.

#### Scenario: The page opens

- **WHEN** a person opens the page
- **THEN** the page shows the canvas of PixiJS, and the color of the canvas changes two times each second

#### Scenario: The page needs no other process

- **WHEN** the page opens and no hub runs in a different process
- **THEN** the page draws the construct and opens no link

### Requirement: The page model has one clear-color entity

The model of the page SHALL have one component type `Clear color` with one field `Color` of the type `string`, and one entity with a `Clear color` component. The first value of the field SHALL be the first color of the color rule.

#### Scenario: The first picture

- **WHEN** the page opens with the construct paused
- **THEN** the canvas has the first color of the color rule

### Requirement: The color rule follows the count of ticks

A model subsystem of the page SHALL apply each input of the store, and SHALL also apply `time/advance`. For each tick, it SHALL set the `Color` field of the entity to the color at the position `ticks` modulo the number of colors, in a list of four different colors. The rule SHALL be a pure function of the part `store` and the part `time`, so that the same record gives the same colors.

#### Scenario: One tick

- **WHEN** the construct is at tick 0 and the hub applies one `time/advance`
- **THEN** the `Color` field has the second color of the list

#### Scenario: Four ticks

- **WHEN** the hub applies four `time/advance` inputs from tick 0
- **THEN** the `Color` field has the first color of the list again

#### Scenario: The same record

- **WHEN** a second construct of the page applies the same record of inputs
- **THEN** its part `store` is equal to the part `store` of the first construct

### Requirement: The ClearColor view fills the viewport

The page SHALL have one PixiJS view, `ClearColor`, attached to the `Clear color` component type by its sidecar. The view SHALL fill the full viewport with the color of its prop `color`. When the prop has no value, or its value is not a color, the view SHALL draw nothing, and the canvas SHALL show the background color of PixiJS.

#### Scenario: A color

- **WHEN** the prop `color` is `#1d4ed8`
- **THEN** the display object of the view covers the viewport and has the color `#1d4ed8`

#### Scenario: A value that is not a color

- **WHEN** the prop `color` is `blue-ish`
- **THEN** the display object of the view is hidden, and no error occurs

### Requirement: The keys control the time

The page SHALL send inputs for two keys. The space key SHALL send `time/set-running` with the opposite of the current value of `running`. The period key SHALL send one `time/advance` of 500 milliseconds. The page SHALL ignore each other key.

#### Scenario: Pause

- **WHEN** the construct runs and the person presses the space key
- **THEN** the clock sends no more ticks, and the color stays the same

#### Scenario: Step while paused

- **WHEN** the construct is paused and the person presses the period key
- **THEN** the count of ticks increases by one, and the canvas has the next color

#### Scenario: Resume

- **WHEN** the construct is paused and the person presses the space key
- **THEN** the clock sends ticks again, and the color changes

### Requirement: The page can start paused

When the address of the page has the query parameter `paused`, the `time` subsystem SHALL start with `running` set to `false`. Otherwise it SHALL start with `running` set to `true`.

#### Scenario: The address has the parameter

- **WHEN** a person opens the page at an address that ends with `/?paused`
- **THEN** the color does not change until the person presses a key

### Requirement: A command serves the page

The command `pnpm --filter @thrashplay/wishem-pixi-page start` SHALL serve the page on `127.0.0.1`, at the port 5174, and SHALL print the address. When the port is in use, the command SHALL stop with an error that names the port. The page SHALL load the source files of the Wishem packages, so that a change to a source file needs no new build.

#### Scenario: The person starts the page

- **WHEN** a person runs the command in a new checkout after `pnpm install` and `pnpm build --filter "@thrashplay/wishem-pixi-page..."`
- **THEN** the terminal shows the address `http://127.0.0.1:5174/`, and that address shows the page

### Requirement: The page stops its subsystems

When the page stops, it SHALL stop the clock, remove the key listener, stop the renderer, close each port, and stop the hub. A second stop SHALL do nothing. A key that the person presses after the stop SHALL send no input.

#### Scenario: A key after the stop

- **WHEN** the page stopped and the person presses the period key
- **THEN** no input is sent and no error occurs

### Requirement: A screenshot test proves that the picture follows the clock

A screenshot test SHALL open the page in the pinned web browser with no window, at the address with `paused`. It SHALL take a screenshot of the canvas before a step, after one step, and after a wait while paused. The first two screenshots SHALL be different, and each SHALL agree with a committed baseline. The third screenshot SHALL be equal to the second. After a resume, a later screenshot SHALL be different from the second.

#### Scenario: The test runs on a computer with Docker

- **WHEN** a person runs `pnpm --filter @thrashplay/wishem-pixi-page test:ui`
- **THEN** the test opens the page in the Playwright image in Docker and passes

#### Scenario: The renderer does not follow the store

- **WHEN** the renderer does not set a display object again after the part `store` changes
- **THEN** the screenshot after one step is equal to the screenshot before it, and the test fails

#### Scenario: Docker is not available

- **WHEN** Docker is not available
- **THEN** the command stops with an error that says that the screenshot tests need Docker
