# wishem/renderer-html/react-page Specification

## Purpose

Defines the React page: a page in a web browser that draws the sample construct through the link with the React renderer, so that the React renderer draws a construct other than the workbench.

## Requirements

### Requirement: The React page reads the sample construct through the link

The React page SHALL be a part of the private package `@thrashplay/wishem-three-renderers`. It SHALL hold no hub. It SHALL open one link at `/link` on the address that served it, with one output subsystem, and the React renderer SHALL draw from the remote port of that subsystem. The page SHALL send no input.

#### Scenario: The page opens

- **WHEN** the sample construct runs and a person opens the React page
- **THEN** the page shows a box of 640 by 360 pixels, and the color of the box changes two times each second

#### Scenario: The page attaches one subsystem

- **WHEN** the page opens a link
- **THEN** the `hello` of the link has one output subsystem and no input subsystem

### Requirement: The ClearColor React view fills the box

The page SHALL have one React view, `ClearColor`, attached to the component type `Color` of the sample product by its sidecar. The view SHALL fill the box of 640 by 360 pixels with the color of its prop `color`, as the requirement "A color of the sample construct is #rrggbb" of `wishem/renderers/sample-construct` gives it. When the prop has no value, or its value is not a color, the view SHALL fill the box with the fallback color `#ff00ff`.

#### Scenario: A color

- **WHEN** the prop `color` is `#1d4ed8`
- **THEN** each pixel of the box is `#1d4ed8`

#### Scenario: No value

- **WHEN** the component has no value for the field `color`
- **THEN** each pixel of the box is `#ff00ff`, and no error occurs

#### Scenario: A value that is not a color

- **WHEN** the prop `color` is `red` or `1d4ed8`
- **THEN** each pixel of the box is `#ff00ff`, and no error occurs

#### Scenario: A color with transparency

- **WHEN** the prop `color` is `#1d4ed880`
- **THEN** each pixel of the box is `#ff00ff`, and the background of the page does not show

### Requirement: The React page shows the state of the link

The page SHALL show one status line below the box: "Connecting to the construct." before the first link, "Connected (link N)." with a link, and "The construct is not reachable. The page tries again." while the link is down. N SHALL be the number of the link since the page loaded, from 1.

#### Scenario: The first link

- **WHEN** the page opens and the construct runs
- **THEN** the status line says "Connected (link 1)."

### Requirement: The React page connects again after the construct stops

When the link ends, the page SHALL keep the last picture and SHALL try to open a new link after 500 milliseconds, then after a delay that doubles each time, at most 5 seconds. When a new link opens, the page SHALL draw the joined state of the new link with no reload.

#### Scenario: The construct stops and starts again

- **WHEN** the page has link 1, the construct stops, and the construct starts again on the same port
- **THEN** the status line says "The construct is not reachable. The page tries again.", then within 5 seconds "Connected (link 2).", and the box has the color of the new construct

### Requirement: A command starts the page server of the React page

The command `pnpm --filter @thrashplay/wishem-three-renderers react-page` SHALL start the page server on port 5175 of `127.0.0.1`, pass the WebSocket at `/link` to the construct on port 4750 of `127.0.0.1`, and print the address of the page. The options `--port` and `--hub-port` SHALL change the two ports. The page server SHALL start also when no construct runs. On `SIGINT` or `SIGTERM`, the command SHALL stop the page server and end with exit code 0.

#### Scenario: The person starts the command

- **WHEN** a person runs the command with no option
- **THEN** the terminal shows `wishem: React page at http://127.0.0.1:5175/` and `wishem: the page connects to ws://127.0.0.1:4750/link`

#### Scenario: The port of the page is in use

- **WHEN** a different program uses port 5175 and a person runs the command
- **THEN** the terminal shows `wishem: port 5175 is in use`, and the command ends with exit code 1

#### Scenario: No construct runs

- **WHEN** no program listens on port 4750, and a person runs the command and opens the page
- **THEN** the page server runs, and the status line says "The construct is not reachable. The page tries again."
