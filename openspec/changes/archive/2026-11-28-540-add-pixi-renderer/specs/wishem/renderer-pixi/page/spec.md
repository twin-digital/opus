# Spec Delta

## Purpose

Defines the PixiJS page: a page in a web browser that reads the construct of the PixiJS page through the link, draws it with the PixiJS renderer, and sends the keys of the person as inputs, so that a person and a test can see that the picture follows the time of a construct in a different process.

## ADDED Requirements

### Requirement: The page reads the construct through the link

The PixiJS page SHALL be a part of the private package `@thrashplay/wishem-pixi-page`. The page SHALL hold no hub. It SHALL open one link at `/link` on the address that served it, with one output subsystem for the renderer and one input subsystem for the keys. The ID of each subsystem SHALL be new for each link. The renderer SHALL draw from the remote port of the output subsystem.

#### Scenario: The page opens

- **WHEN** the construct runs and a person opens the page
- **THEN** the page shows the canvas of PixiJS, and the color of the canvas changes two times each second

#### Scenario: The page attaches two subsystems

- **WHEN** the page opens a link
- **THEN** the `hello` of the link has one output subsystem and one input subsystem, and the hub attaches both

### Requirement: The ClearColor view fills the viewport

The page SHALL have one PixiJS view, `ClearColor`, attached to the `Clear color` component type by its sidecar. The view SHALL fill the full viewport with the color of its prop `color`. When the prop has no value, or its value is not a color, the view SHALL draw nothing, and the canvas SHALL show the background color of PixiJS.

#### Scenario: A color

- **WHEN** the prop `color` is `#1d4ed8`
- **THEN** the display object of the view covers the viewport and has the color `#1d4ed8`

#### Scenario: A value that is not a color

- **WHEN** the prop `color` is `blue-ish`
- **THEN** the display object of the view is hidden, and no error occurs

### Requirement: The keys control the time through the link

The page SHALL send the inputs of two keys through its input subsystem. The space key SHALL send `time/set-running` with the opposite of the current value of `running`. The period key SHALL send one `time/advance` of 500 milliseconds. The page SHALL ignore each other key. While the page has no link, a key SHALL send nothing, and the page SHALL NOT send it later.

#### Scenario: Pause

- **WHEN** the construct runs and the person presses the space key
- **THEN** the clock sends no more ticks, and the color stays the same

#### Scenario: Step while paused

- **WHEN** the construct is paused and the person presses the period key
- **THEN** the count of ticks increases by one, and the canvas has the next color

#### Scenario: Run again

- **WHEN** the construct is paused and the person presses the space key
- **THEN** the clock sends ticks again, and the color changes

#### Scenario: The source of a key

- **WHEN** the person presses the period key
- **THEN** the record of the hub holds the `time/advance` with the ID of the input subsystem of the page as its source

#### Scenario: A key while the link is down

- **WHEN** the process is stopped and the person presses the period key
- **THEN** the page sends no input, and after the next link the count of ticks is the count of the new construct

### Requirement: The page shows the state of the link

The page SHALL show one status line below the canvas. Before the first link it SHALL say "Connecting to the construct.". With a link it SHALL say "Connected (link N). Space: pause or run. Period: one step.", where N is the number of the link since the page loaded, from 1. While the page has no link it SHALL say "The construct is not reachable. The page tries again.".

#### Scenario: The first link

- **WHEN** the page gets its first link
- **THEN** the status line says "Connected (link 1). Space: pause or run. Period: one step."

### Requirement: The page connects again after the process stops

When the link ends, the page SHALL keep the last picture, and SHALL try to open a new link after 500 milliseconds, then after a delay that doubles each time, at most 5 seconds. When a new link opens, the page SHALL draw the joined state of the new link, with no reload of the page.

#### Scenario: The process stops

- **WHEN** the page has a link and the process stops
- **THEN** the canvas keeps the last color, and the status line says "The construct is not reachable. The page tries again."

#### Scenario: The process starts again

- **WHEN** the process stopped, the page stays open, and the process starts again
- **THEN** within 5 seconds the status line says "Connected (link 2). Space: pause or run. Period: one step.", and the canvas has the color of the new construct

#### Scenario: A rewind from a different client

- **WHEN** the page has a link and a different client of the link sends `hub/rewind`
- **THEN** the canvas has the color of the state after the target, with no reload

### Requirement: The page stops its parts

When the page stops, it SHALL close its link and open no new one, remove the key listener, stop the renderer, and close each port. A second stop SHALL do nothing. A key that the person presses after the stop SHALL send no input.

#### Scenario: A key after the stop

- **WHEN** the page stopped and the person presses the period key
- **THEN** no input is sent and no error occurs

### Requirement: A screenshot test proves that the picture follows the construct through the link

A screenshot test SHALL start the real construct process, paused, and open the page in the pinned web browser with no window. It SHALL take a screenshot of the canvas before a step, after one step, and after a wait while paused. The first two screenshots SHALL be different, and each SHALL agree with a committed baseline. The third screenshot SHALL be equal to the second. After the space key, a later screenshot SHALL be different from the second.

#### Scenario: The test runs on a computer with Docker

- **WHEN** a person runs `pnpm --filter @thrashplay/wishem-pixi-page test:ui`
- **THEN** the test starts the construct process, opens the page in the Playwright image in Docker, and passes

#### Scenario: The renderer does not follow the store

- **WHEN** the renderer does not set a display object again after the part `store` changes
- **THEN** the screenshot after one step is equal to the screenshot before it, and the test fails

#### Scenario: The input does not go through the link

- **WHEN** the keys of the page do not submit the step through the link
- **THEN** the screenshot after one step is equal to the screenshot before it, and the test fails

#### Scenario: Docker is not available

- **WHEN** Docker is not available
- **THEN** the command stops with an error that says that the screenshot tests need Docker
