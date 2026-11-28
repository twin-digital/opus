# Spec Delta

## ADDED Requirements

### Requirement: A program serves the link of a hub that it made

The package `@thrashplay/wishem-host-nodejs` SHALL let a Node.js program serve the link of a hub that the program made, with no model folder and no storage subsystem, on a port that the program gives. The server SHALL obey each other requirement of this specification. The server SHALL NOT start the hub. When the port is in use, the start SHALL fail with the error of the port and SHALL hold no socket.

#### Scenario: A hub with a clock and no storage

- **WHEN** a program makes a hub with the `time` subsystem and the store, serves it on port 0, and starts it
- **THEN** a client of the link gets `welcome` with the parts `time` and `store`

#### Scenario: The port is in use

- **WHEN** a program serves a hub on a port that a different server uses
- **THEN** the start fails with the error `EADDRINUSE`, the hub is not started, and a later start on a free port works

#### Scenario: The stop of the server

- **WHEN** the program stops the server while a link is open and the hub runs
- **THEN** the client gets the `stopping` event, the connection closes, the hub is stopped, and a second stop does nothing

#### Scenario: The construct of a model folder

- **WHEN** a person runs `wishem start <folder>`
- **THEN** the link at `/link`, the Origin check, the 404 answers, and the stop behave as before
