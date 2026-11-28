# wishem/host-nodejs/server Specification

## Purpose

Defines the local server of the Node.js process that runs a construct. The server carries the link to the hub as a WebSocket for programs on the same computer, such as a page in a web browser.

## Requirements

### Requirement: The server is local

The server SHALL listen only on the loopback address `127.0.0.1`. A program on a different computer SHALL NOT be able to connect.

#### Scenario: A request from the same computer

- **WHEN** the server runs on port 4747 and a program on the same computer opens a WebSocket to `ws://127.0.0.1:4747/link`
- **THEN** the connection opens

#### Scenario: A request to a different address of the computer

- **WHEN** a program connects to port 4747 on a network address of the computer that is not the loopback address
- **THEN** the connection is refused

### Requirement: The server carries the link at /link

The server SHALL accept a WebSocket connection at the path `/link`. Each connection SHALL be one link to the hub of the construct, by the protocol of `wishem/hub/link`. More than one link SHALL be able to be open at the same time.

#### Scenario: A client opens a link

- **WHEN** the construct runs for the base workbench, and a client opens a link at `/link` with one output subsystem
- **THEN** the client gets `welcome`, and the part `store` of its state holds the component type `AppBar` and one entity

#### Scenario: Two links and one change

- **WHEN** two links are open, and the store applies an input
- **THEN** each client gets one `applied` message

#### Scenario: A link closes

- **WHEN** one of two links closes, and then the store applies an input
- **THEN** the server continues, and the other client gets the `applied` message

### Requirement: The server refuses a link from a page of a different site

The server SHALL refuse a WebSocket connection with HTTP status 403 when the request has an `Origin` header whose host name is not `127.0.0.1`, `localhost`, or `[::1]`, with any port. The server SHALL refuse an `Origin` header that is not a URL. The server SHALL accept a request with no `Origin` header. A web page of a different site SHALL NOT be able to read or change the model.

#### Scenario: A page of a different site

- **WHEN** a request to open a WebSocket at `/link` has the header `Origin: https://example.com`
- **THEN** the response has status 403, and no subsystem is attached to the hub

#### Scenario: The page of the workbench

- **WHEN** a request to open a WebSocket at `/link` has the header `Origin: http://127.0.0.1:5173`
- **THEN** the connection opens

#### Scenario: A program that is not a web browser

- **WHEN** a request to open a WebSocket at `/link` has no `Origin` header
- **THEN** the connection opens

#### Scenario: An origin that is not a URL

- **WHEN** a request to open a WebSocket at `/link` has the header `Origin: null`
- **THEN** the response has status 403

### Requirement: The server stops each link cleanly

When the server stops, it SHALL stop the hub, so that each open link gets the `stopping` event and then closes. Then it SHALL release the port.

#### Scenario: Stop with an open link

- **WHEN** a link is open and the server stops
- **THEN** the client gets the `stopping` event, the connection closes, and a new server can use the same port

#### Scenario: A connection during the stop

- **WHEN** the server stops, and a client sends `hello` after the hub stopped and before the port is released
- **THEN** the client gets `refused` with the reason `stopped`, or the connection is refused

### Requirement: Each other request gets status 404

Each HTTP request that does not open a WebSocket at `/link` SHALL get status 404 and a JSON body with an `error` message. A request to open a WebSocket at a different path SHALL get status 404.

#### Scenario: A path that is not known

- **WHEN** a person runs `curl http://127.0.0.1:4747/snapshot`
- **THEN** the response has status 404 and a JSON body with an `error` message

#### Scenario: A plain request to the path of the link

- **WHEN** a request to `/link` uses the method `GET` and does not ask for a WebSocket
- **THEN** the response has status 404 and a JSON body with an `error` message

#### Scenario: A WebSocket at a different path

- **WHEN** a client asks for a WebSocket at `/links`
- **THEN** the response has status 404, and no subsystem is attached to the hub

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
