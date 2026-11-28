# Spec Delta

## MODIFIED Requirements

### Requirement: A command runs the Godot application

The command `pnpm --filter @thrashplay/wishem-renderer-godot godot` SHALL start the Godot application in a container with a viewport of 640 by 360 pixels, and SHALL show each line of the application in the terminal. The option `--hub-port` SHALL give the port of the construct, with the default 4750, the port of the sample construct. On `SIGINT` or `SIGTERM`, the command SHALL remove the container and end with exit code 0.

#### Scenario: Ctrl+C

- **WHEN** the command runs and the person presses Ctrl+C
- **THEN** the command ends with exit code 0, and `docker ps` shows no container of the command

#### Scenario: The default port

- **WHEN** a person runs the command with no option
- **THEN** the terminal shows `wishem-godot: connecting to ws://127.0.0.1:4750/link`

### Requirement: The application draws the construct through the link

The application SHALL open one link with one output subsystem with the prefix `godot-screen`, and SHALL draw the part `store` with the Godot renderer and the `ClearColor` view. The sidecar of the view SHALL attach it to the component type `Color` of the sample product. The application SHALL send no input.

#### Scenario: One tick

- **WHEN** the application draws the sample construct at tick 0 and the clock sends one tick
- **THEN** the picture has the color `#b91c1c`

#### Scenario: The sidecar

- **WHEN** a test reads `godot/views/ClearColor.view.json`
- **THEN** it has the kind `godot` and the component type `ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512`

### Requirement: A screenshot test runs the two processes

The command `pnpm --filter @thrashplay/wishem-renderer-godot test:ui` SHALL run the GDScript tests in the image, and then a test that starts the sample construct paused, runs the real application, steps the construct through the link, stops and starts the construct, and checks the pixels of the screenshots. The test SHALL fail when the picture does not follow the store or when the application does not connect again.

#### Scenario: The renderer does not follow the store

- **WHEN** the renderer does not update a node after a new part `store`
- **THEN** the test fails at the check of the screenshot after the step

#### Scenario: The application does not connect again

- **WHEN** the remote port does not try again after a link ends
- **THEN** the test fails at the check of link 2
