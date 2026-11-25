# wishem/workbench/start Specification

## Purpose

Defines the one command that starts the workbench for a person: it starts the core of the workbench and the page that draws it, prints where each one is, and stops them together.

## Requirements

### Requirement: One command starts the core and the page

The package of the workbench page SHALL have a `start` script. The script SHALL start one core for a model folder and SHALL serve the page of the workbench. The script SHALL print the address of the page. The default model folder SHALL be the model folder of the base workbench.

#### Scenario: Start the workbench

- **WHEN** a person runs `pnpm --filter @thrashplay/wishem-workbench-app start`
- **THEN** the command prints the model folder and the address of the page, and a web browser that opens the address shows the app bar with the title `Wishem`

#### Scenario: A different model folder

- **WHEN** a person runs the script with `--model ./my-model`
- **THEN** the page draws the model of that folder

### Requirement: The page address also gives the snapshot

The address that serves the page SHALL pass `GET /snapshot` and `GET /snapshots` to the core. The responses SHALL be the responses of the core.

#### Scenario: The snapshot through the address of the page

- **WHEN** the workbench runs and a person runs `curl` on `/snapshot` at the address of the page
- **THEN** the output is the snapshot of the core as JSON

### Requirement: The core and the page stop together

When the command gets an interrupt signal, it SHALL stop the page server and the core, and it SHALL stop with exit code 0. When the core cannot start, the command SHALL NOT serve the page.

#### Scenario: The person stops the command

- **WHEN** the person sends an interrupt signal to the running command
- **THEN** the address of the page and the address of the core accept no connection, and the command stops with exit code 0

#### Scenario: The model is not correct at the start

- **WHEN** a person runs the script and `state.json` is not valid JSON
- **THEN** the command prints a problem that names `state.json`, serves no page, and stops with a non-zero exit code

### Requirement: The ports can be selected

The option `--port <number>` SHALL select the port of the page. The option `--core-port <number>` SHALL select the port of the core. The value 0 SHALL let the system select a port, and the command SHALL print the port that the system selected. When a port is in use, the command SHALL print which port is in use, SHALL stop each part that it started, and SHALL stop with a non-zero exit code.

#### Scenario: The default ports

- **WHEN** a person runs the script with no option
- **THEN** the command prints the page address with port 5173 and the core address with port 4747

#### Scenario: The port of the page is in use

- **WHEN** a different process uses the port of the page
- **THEN** the command prints that the port is in use, the port of the core is free again, and the command stops with a non-zero exit code

### Requirement: The page is local

The page server SHALL listen only on the loopback address `127.0.0.1`. A program on a different computer SHALL NOT be able to connect to the page or, through the page, to the snapshot.

#### Scenario: A request from a different computer

- **WHEN** the workbench runs and a program connects to the port of the page on a network address of the computer that is not the loopback address
- **THEN** the connection is refused

### Requirement: An edit to a view shows with no restart

While the command runs, a saved change to a view file SHALL show in the open page. The person SHALL NOT need to start the command again or to reload the page by hand.

#### Scenario: A person edits the view of the app bar

- **WHEN** the workbench runs, the page is open, and a person saves a change to the view file of the app bar
- **THEN** the page shows the change
