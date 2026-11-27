# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: One command starts the core and the page`
- TO: `### Requirement: One command starts the construct and the page`

- FROM: `### Requirement: The core and the page stop together`
- TO: `### Requirement: The construct and the page stop together`

## MODIFIED Requirements

### Requirement: One command starts the construct and the page

The package of the workbench page SHALL have a `start` script. The script SHALL start one construct for a model folder and SHALL serve the page of the workbench. The script SHALL print the address of the link and the address of the page. The default model folder SHALL be the model folder of the base workbench.

#### Scenario: Start the workbench

- **WHEN** a person runs `pnpm --filter @thrashplay/wishem-workbench-app start`
- **THEN** the command prints the model folder, the address of the link, and the address of the page, and a web browser that opens the address of the page shows the app bar with the title `Wishem`

#### Scenario: A different model folder

- **WHEN** a person runs the script with `--model ./my-model`
- **THEN** the page draws the model of that folder

### Requirement: The construct and the page stop together

When the command gets an interrupt signal, it SHALL stop the page server and the construct, and it SHALL stop with exit code 0. When the construct cannot start, the command SHALL NOT serve the page.

#### Scenario: The person stops the command

- **WHEN** the person sends an interrupt signal to the running command
- **THEN** the address of the page and the address of the link accept no connection, and the command stops with exit code 0

#### Scenario: The model is not correct at the start

- **WHEN** a person runs the script and `state.json` is not valid JSON
- **THEN** the command prints a problem that names `state.json`, serves no page, and stops with a non-zero exit code

### Requirement: The ports can be selected

The option `--port <number>` SHALL select the port of the page. The option `--hub-port <number>` SHALL select the port of the server of the construct. The value 0 SHALL let the system select a port, and the command SHALL print the port that the system selected. When a port is in use, the command SHALL print which port is in use, SHALL stop each part that it started, and SHALL stop with a non-zero exit code.

#### Scenario: The default ports

- **WHEN** a person runs the script with no option
- **THEN** the command prints the page address with port 5173 and the link address with port 4747

#### Scenario: The port of the page is in use

- **WHEN** a different process uses the port of the page
- **THEN** the command prints that the port is in use, the port of the hub is free again, and the command stops with a non-zero exit code

### Requirement: The page is local

The page server SHALL listen only on the loopback address `127.0.0.1`. A program on a different computer SHALL NOT be able to connect to the page or, through the page, to the link.

#### Scenario: A request from a different computer

- **WHEN** the workbench runs and a program connects to the port of the page on a network address of the computer that is not the loopback address
- **THEN** the connection is refused

## ADDED Requirements

### Requirement: The page address also carries the link

The address that serves the page SHALL pass a WebSocket at the path `/link` to the server of the construct. The page server SHALL pass no other path to the server of the construct.

#### Scenario: A link through the address of the page

- **WHEN** the workbench runs and a client opens a link at `/link` of the address of the page
- **THEN** the client gets the `welcome` message of the hub, and an input that the client sends changes `state.json`

#### Scenario: A path that only starts with /link

- **WHEN** the workbench runs and a client asks for `/linkx` at the address of the page
- **THEN** the server of the construct does not get the request

## REMOVED Requirements

### Requirement: The page address also gives the snapshot

**Reason**: The construct serves no snapshot. The page reads the model through a link.

**Migration**: See "The page address also carries the link". Open a link at `/link` of the address of the page.
