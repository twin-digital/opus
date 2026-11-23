# Spec Delta

## Purpose

Defines the command that starts a Wishem core for one model folder with no window, keeps the core in agreement with the files, and serves the snapshot on a local port.

## ADDED Requirements

### Requirement: One command starts a core for a model folder

The command `wishem start <folder>` SHALL read the model folder, start one core with that model, serve the snapshot on a local port, and print the address. The command SHALL run with no window and with no web browser. The command SHALL run until it gets an interrupt signal, and then it SHALL close the port and stop with exit code 0.

#### Scenario: A correct model

- **WHEN** the designer runs `wishem start ./model` and the model is correct
- **THEN** the command prints the number of component types, the number of entities, and the address of the snapshot, and it continues to run

#### Scenario: The designer stops the command

- **WHEN** the designer sends an interrupt signal to the running command
- **THEN** the port closes and the command stops with exit code 0

#### Scenario: No folder is given

- **WHEN** the designer runs `wishem start` with no folder
- **THEN** the command prints how to use it and stops with a non-zero exit code

### Requirement: The command does not start with a model that is not correct

When the model folder does not exist or the model is not correct at the start, the command SHALL print each problem and SHALL stop with a non-zero exit code. The command SHALL NOT open the port.

#### Scenario: A problem at the start

- **WHEN** the designer runs `wishem start ./model` and `state.json` is not valid JSON
- **THEN** the command prints a problem that names `state.json`, opens no port, and stops with a non-zero exit code

### Requirement: The port is local and can be selected

The command SHALL listen only on the loopback address `127.0.0.1`. The default port SHALL be 4747. The option `--port <number>` SHALL select a different port. When the port is in use, the command SHALL print the reason and SHALL stop with a non-zero exit code.

#### Scenario: The default port

- **WHEN** the designer runs `wishem start ./model`
- **THEN** the snapshot is at `http://127.0.0.1:4747/snapshot`

#### Scenario: A selected port

- **WHEN** the designer runs `wishem start ./model --port 5000`
- **THEN** the snapshot is at `http://127.0.0.1:5000/snapshot`

#### Scenario: The port is in use

- **WHEN** a different process uses the port
- **THEN** the command prints that the port is in use and stops with a non-zero exit code

### Requirement: The current snapshot through HTTP

`GET /snapshot` SHALL return status 200, the content type `application/json`, and the current snapshot as the body.

#### Scenario: Get the snapshot with curl

- **WHEN** the command runs and a person runs `curl http://127.0.0.1:4747/snapshot`
- **THEN** the output is the snapshot as JSON, with the definitions and the entities

#### Scenario: A path that is not known

- **WHEN** a request is for a path that is not `/snapshot` or `/snapshots`
- **THEN** the response has status 404 and a JSON body with an `error` message

#### Scenario: A method that is not GET

- **WHEN** a request to `/snapshot` uses the method `POST`
- **THEN** the response has status 405 and a JSON body with an `error` message

### Requirement: Each new snapshot through Server-Sent Events

`GET /snapshots` SHALL return a stream with the content type `text/event-stream`. The stream SHALL send the current snapshot when the connection opens, and the full new snapshot after each change. Each event SHALL have the name `snapshot` and the snapshot as JSON on one `data` line. More than one connection SHALL be able to be open at the same time.

#### Scenario: A connection opens

- **WHEN** a person runs `curl -N http://127.0.0.1:4747/snapshots`
- **THEN** the first event is `snapshot` with the current snapshot

#### Scenario: A change while two connections are open

- **WHEN** two connections are open and the model changes
- **THEN** each connection gets one `snapshot` event with the new snapshot

#### Scenario: A connection closes

- **WHEN** a connection closes, and then the model changes
- **THEN** the command continues, and the other connections get the new snapshot

### Requirement: The core follows the model files

The command SHALL watch `state.json` and the `definitions` folder. After a file changes, is added, or is removed, the command SHALL read the model folder again and give the model to the core. A restart of the command SHALL NOT be necessary.

#### Scenario: A hand edit to the authored state

- **WHEN** the command runs, and a person changes the title in `state.json` from `Wishem` to `Wishem workbench` and saves the file
- **THEN** the next `GET /snapshot` returns `Wishem workbench`, in less than 2 seconds

#### Scenario: A hand edit to a definition

- **WHEN** the command runs, and a person changes the label of a component type in its definition file
- **THEN** the next `GET /snapshot` returns the new label

#### Scenario: A new definition file

- **WHEN** the command runs, and a person adds a correct definition file to `definitions`
- **THEN** the next `GET /snapshot` holds the new component type

### Requirement: A problem during a run does not stop the command

When the model files are not correct during a run, the command SHALL print each problem in the terminal, with the file that has the problem, and SHALL continue to serve the last correct snapshot. When the files are correct again, the command SHALL serve the new snapshot and SHALL print that the model is correct. The command SHALL print each warning and SHALL serve the snapshot.

#### Scenario: A file that is saved in part

- **WHEN** the command runs and `state.json` is saved with text that is not valid JSON
- **THEN** the terminal shows a problem that names `state.json`, and `GET /snapshot` returns the last correct snapshot

#### Scenario: The file is corrected

- **WHEN** `state.json` was not correct, and a person saves a correct `state.json`
- **THEN** the terminal shows that the model is correct, and `GET /snapshot` returns the new snapshot

#### Scenario: A warning

- **WHEN** two component types have the same label
- **THEN** the terminal shows the warning, and the snapshot holds the two component types

### Requirement: The base workbench starts with one command

The package of the base workbench SHALL have a `start` script that runs `wishem start` on its model folder. The model SHALL hold one component type with the label `AppBar`, which has one string field with the label `title`, and one entity with an `AppBar` component.

#### Scenario: Start the base workbench

- **WHEN** a person runs `pnpm --filter @thrashplay/wishem-workbench start`
- **THEN** the command starts, and `GET /snapshot` returns one component type with the label `AppBar` and one entity
