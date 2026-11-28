# wishem/renderer-godot/application Specification

## Purpose

Defines the Godot application in a Docker container: the pinned image, the command that runs it, how its link reaches the construct, the screenshots with no window, the lines in the terminal, the connection again after a stop, and the screenshot test.

## Requirements

### Requirement: Godot runs in a pinned Docker image

The Godot application SHALL run only in a Docker container, from an image that the package builds from its own Dockerfile. The image SHALL hold Godot 4.7.2 from the official release, checked against its SHA-512 sum, a virtual display, and software rendering. The tag of the image SHALL change when a file of the image changes. No step SHALL install Godot on the computer of the person.

#### Scenario: The image is built

- **WHEN** a person runs `pnpm --filter @thrashplay/wishem-renderer-godot godot:image`
- **THEN** the terminal shows `wishem-godot: image wishem-godot:<tag> is ready`, and `godot --version` in the image gives `4.7.2.stable`

#### Scenario: Docker is not available

- **WHEN** `docker info` fails and a person runs a command of the package that needs Docker
- **THEN** the command shows that it needs Docker and ends with exit code 1

### Requirement: A command runs the Godot application

The command `pnpm --filter @thrashplay/wishem-renderer-godot godot` SHALL start the Godot application in a container with a viewport of 640 by 360 pixels, and SHALL show each line of the application in the terminal. The option `--hub-port` SHALL give the port of the construct, with the default 4750, the port of the sample construct. On `SIGINT` or `SIGTERM`, the command SHALL remove the container and end with exit code 0.

#### Scenario: Ctrl+C

- **WHEN** the command runs and the person presses Ctrl+C
- **THEN** the command ends with exit code 0, and `docker ps` shows no container of the command

#### Scenario: The default port

- **WHEN** a person runs the command with no option
- **THEN** the terminal shows `wishem-godot: connecting to ws://127.0.0.1:4750/link`

### Requirement: The link of the application reaches the construct

The Godot application SHALL open its link at `ws://127.0.0.1:<hub port>/link` in the container. The command SHALL carry the bytes of each connection between the container and port `<hub port>` of `127.0.0.1` on the computer of the command. This SHALL work with a local and with a remote Docker daemon, and SHALL need no published port and no change to the server of the construct.

#### Scenario: A remote Docker daemon

- **WHEN** `DOCKER_HOST` names a Docker daemon on a different computer and the construct runs on the computer of the command
- **THEN** the application gets `welcome` from the construct

#### Scenario: The construct is not running

- **WHEN** no program listens on the hub port
- **THEN** the connection in the container closes, and the application tries again

### Requirement: The application draws the construct through the link

The application SHALL open one link with one output subsystem with the prefix `godot-screen`, and SHALL draw the part `store` with the Godot renderer and the `ClearColor` view. The sidecar of the view SHALL attach it to the component type `Color` of the sample product. The application SHALL send no input.

#### Scenario: One tick

- **WHEN** the application draws the sample construct at tick 0 and the clock sends one tick
- **THEN** the picture has the color `#b91c1c`

#### Scenario: The sidecar

- **WHEN** a test reads `godot/views/ClearColor.view.json`
- **THEN** it has the kind `godot` and the component type `ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512`

### Requirement: The application writes a screenshot when the picture changes

After each drawing that follows a `welcome` or a new part `store`, the application SHALL take the rendered image of the viewport and write it as a PNG file with a number that goes up by 1. The command SHALL copy each file to `nodejs/wishem/renderer-godot/shots/`, which it empties at its start. The application SHALL show `wishem-godot: shot <n> seq <seq> color <color>`, where `<color>` is the pixel at the center of that image.

#### Scenario: The first picture

- **WHEN** the application connects to a construct that starts paused
- **THEN** the terminal shows `wishem-godot: shot 1 seq 0 color #1d4ed8`, and each pixel of `shots/0001.png` is `#1d4ed8`

#### Scenario: The construct is paused

- **WHEN** the construct is paused and no input arrives for 1500 milliseconds
- **THEN** the application writes no new screenshot

### Requirement: The application shows the state of the link

The application SHALL show `wishem-godot: connected (link <n>)` after each `welcome`, where `<n>` is 1 for the first link and goes up by 1, and `wishem-godot: the hub is not reachable. Godot tries again.` one time for each loss. While the link is down, the picture SHALL stay the same.

#### Scenario: The construct stops and starts again

- **WHEN** the application has link 1, the construct stops, and the construct starts again on the same port
- **THEN** the terminal shows the loss one time, then `wishem-godot: connected (link 2)`, and a screenshot of the first color

### Requirement: A screenshot test runs the two processes

The command `pnpm --filter @thrashplay/wishem-renderer-godot test:ui` SHALL run the GDScript tests in the image, and then a test that starts the sample construct paused, runs the real application, steps the construct through the link, stops and starts the construct, and checks the pixels of the screenshots. The test SHALL fail when the picture does not follow the store or when the application does not connect again.

#### Scenario: The renderer does not follow the store

- **WHEN** the renderer does not update a node after a new part `store`
- **THEN** the test fails at the check of the screenshot after the step

#### Scenario: The application does not connect again

- **WHEN** the remote port does not try again after a link ends
- **THEN** the test fails at the check of link 2
