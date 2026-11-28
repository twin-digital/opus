# Spec Delta

## MODIFIED Requirements

### Requirement: The page reads the construct through the link

The PixiJS page SHALL be a part of the private package `@thrashplay/wishem-pixi-page`. The page SHALL hold no hub. It SHALL open one link at `/link` on the address that served it, with one output subsystem for the renderer and one input subsystem for the keys. Each subsystem SHALL keep one ID for the life of the page, also when the link ends and the page opens a new link. The page SHALL make new IDs only after the hub refuses a `hello` with `id-in-use`. The renderer SHALL draw from the remote port of the output subsystem.

#### Scenario: The page opens

- **WHEN** the sample construct runs and a person opens the page
- **THEN** the page shows the canvas of PixiJS, and the color of the canvas changes two times each second

#### Scenario: The page attaches two subsystems

- **WHEN** the page opens a link
- **THEN** the `hello` of the link has one output subsystem and one input subsystem, and the hub attaches both

#### Scenario: The same IDs after a new link

- **WHEN** the link of the page ends and the page opens a new link
- **THEN** the `hello` of the new link holds the same subsystem IDs as the `hello` before

#### Scenario: New IDs after id-in-use

- **WHEN** the hub refuses a `hello` of the page with `id-in-use`
- **THEN** the page makes new subsystem IDs for the next link

#### Scenario: A key changes the picture of each renderer

- **WHEN** the PixiJS page, the React page, and the Godot application draw the paused sample construct, and the person presses the period key in the PixiJS page
- **THEN** each of the three pictures has the next color

### Requirement: The ClearColor view fills the viewport

The page SHALL have one PixiJS view, `ClearColor`, attached to the component type `Color` of the sample product by its sidecar. The view SHALL fill the full viewport with the color of its prop `color`. When the prop has no value, or its value is not a color, the view SHALL draw nothing, and the canvas SHALL show the background color of PixiJS.

#### Scenario: A color

- **WHEN** the prop `color` is `#1d4ed8`
- **THEN** the display object of the view covers the viewport and has the color `#1d4ed8`

#### Scenario: A value that is not a color

- **WHEN** the prop `color` is `blue-ish`
- **THEN** the display object of the view is hidden, and no error occurs

#### Scenario: The sidecar

- **WHEN** a test reads `src/views/ClearColor.view.json`
- **THEN** it has the kind `pixi` and the component type `ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512`

### Requirement: A screenshot test proves that the picture follows the construct through the link

A screenshot test SHALL start the sample construct, paused, and the real command of the page server, and open the page in the pinned web browser with no window. It SHALL take a screenshot of the canvas before a step, after one step, and after a wait while paused. The first two screenshots SHALL be different, and each SHALL agree with a committed baseline. The third screenshot SHALL be equal to the second. After the space key, a later screenshot SHALL be different from the second.

#### Scenario: The test runs on a computer with Docker

- **WHEN** a person runs `pnpm --filter @thrashplay/wishem-pixi-page test:ui`
- **THEN** the test starts the sample construct and the page server, opens the page in the Playwright image in Docker, and passes

#### Scenario: The renderer does not follow the store

- **WHEN** the renderer does not set a display object again after the part `store` changes
- **THEN** the screenshot after one step is equal to the screenshot before it, and the test fails

#### Scenario: The input does not go through the link

- **WHEN** the keys of the page do not submit the step through the link
- **THEN** the screenshot after one step is equal to the screenshot before it, and the test fails

#### Scenario: Docker is not available

- **WHEN** Docker is not available
- **THEN** the command stops with an error that says that the screenshot tests need Docker

## ADDED Requirements

### Requirement: A command starts the page server of the PixiJS page

The command `pnpm --filter @thrashplay/wishem-pixi-page start` SHALL start the page server on port 5174 of `127.0.0.1`, pass the WebSocket at `/link` to the construct on port 4750 of `127.0.0.1`, and print the address of the page and of the link. The options `--port` and `--hub-port` SHALL change the two ports, and 0 for `--port` SHALL let the system select one. The page server SHALL start also when no construct runs. The command SHALL start no construct.

#### Scenario: The person starts the command

- **WHEN** a person runs the command in a new checkout after `pnpm install` and `pnpm build --filter "@thrashplay/wishem-pixi-page..."`
- **THEN** the terminal shows `wishem: PixiJS page at http://127.0.0.1:5174/` and `wishem: the page connects to ws://127.0.0.1:4750/link`

#### Scenario: The port of the page is in use

- **WHEN** a different program uses port 5174, and the person runs the command
- **THEN** the command writes `wishem: port 5174 is in use`, and ends with exit code 1

#### Scenario: No construct runs

- **WHEN** no program listens on port 4750, and the person runs the command and opens the page
- **THEN** the page server runs, and the status line says "The construct is not reachable. The page tries again."

#### Scenario: A different hub port

- **WHEN** the sample construct runs with `--hub-port 4760`, and the person runs the command with `--hub-port 4760`
- **THEN** the page draws the sample construct

### Requirement: The command stops the page server

On Ctrl+C or `SIGTERM`, the command SHALL close each WebSocket that it passes, stop the page server, release the port, and end with exit code 0. The construct SHALL continue to run. A second stop request SHALL do nothing.

#### Scenario: Stop with an open link

- **WHEN** a page has an open link and the person presses Ctrl+C
- **THEN** the command ends with exit code 0, the sample construct continues to run, and a new start can use the same port
