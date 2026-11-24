# wishem/host-nodejs/server Specification

## Purpose

Defines the local HTTP server of the Node.js host, which gives the snapshot of a core to programs on the same computer, such as a page in a web browser, an agent, or `curl`.

## Requirements

### Requirement: The server is local

The server SHALL listen only on the loopback address `127.0.0.1`. A program on a different computer SHALL NOT be able to connect.

#### Scenario: A request from the same computer

- **WHEN** the server runs on port 4747 and a person runs `curl http://127.0.0.1:4747/snapshot`
- **THEN** the request gets a response

#### Scenario: A request to a different address of the computer

- **WHEN** a program connects to port 4747 on a network address of the computer that is not the loopback address
- **THEN** the connection is refused

### Requirement: The current snapshot through HTTP

`GET /snapshot` SHALL return status 200, the content type `application/json`, and the current snapshot of the core as the body.

#### Scenario: Get the snapshot with curl

- **WHEN** the server runs and a person runs `curl http://127.0.0.1:4747/snapshot`
- **THEN** the output is the snapshot as JSON, with the definitions and the entities

#### Scenario: A path that is not known

- **WHEN** a request is for a path that is not `/snapshot` or `/snapshots`
- **THEN** the response has status 404 and a JSON body with an `error` message

#### Scenario: A method that is not GET

- **WHEN** a request to `/snapshot` uses the method `POST`
- **THEN** the response has status 405 and a JSON body with an `error` message

### Requirement: Each new snapshot through Server-Sent Events

`GET /snapshots` SHALL return a stream with the content type `text/event-stream`. The stream SHALL send the current snapshot when the connection opens, and the full new snapshot each time the core sends one. Each event SHALL have the name `snapshot` and the snapshot as JSON on one `data` line. More than one connection SHALL be able to be open at the same time.

#### Scenario: A connection opens

- **WHEN** a person runs `curl -N http://127.0.0.1:4747/snapshots`
- **THEN** the first event is `snapshot` with the current snapshot

#### Scenario: A change while two connections are open

- **WHEN** two connections are open and the model of the core changes
- **THEN** each connection gets one `snapshot` event with the new snapshot

#### Scenario: A connection closes

- **WHEN** a connection closes, and then the model of the core changes
- **THEN** the server continues, and the other connections get the new snapshot

### Requirement: The server stops cleanly

When the server stops, it SHALL end each open stream and SHALL release the port.

#### Scenario: Stop with an open stream

- **WHEN** a stream connection is open and the server stops
- **THEN** the stream ends, and a new server can use the same port
