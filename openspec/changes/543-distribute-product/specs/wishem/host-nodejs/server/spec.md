# Spec Delta

## MODIFIED Requirements

### Requirement: Each other request gets status 404

When the program gives no request handler, each HTTP request that does not open a WebSocket at `/link` SHALL get status 404 and a JSON body with an `error` message. A request to open a WebSocket at a different path SHALL get status 404.

#### Scenario: A path that is not known

- **WHEN** a person runs `curl http://127.0.0.1:4747/snapshot`
- **THEN** the response has status 404 and a JSON body with an `error` message

#### Scenario: A plain request to the path of the link

- **WHEN** a request to `/link` uses the method `GET` and does not ask for a WebSocket
- **THEN** the response has status 404 and a JSON body with an `error` message

#### Scenario: A WebSocket at a different path

- **WHEN** a client asks for a WebSocket at `/links`
- **THEN** the response has status 404, and no subsystem is attached to the hub

## ADDED Requirements

### Requirement: A program can answer the other requests

A program that serves the link of a hub SHALL be able to give a request handler. The server SHALL give the handler each HTTP request that does not open a WebSocket. A request to open a WebSocket at a path other than `/link` SHALL still get status 404. The link and the check of the origin SHALL not change.

#### Scenario: A handler of the program

- **WHEN** a program serves a hub with a handler that answers `GET /` with status 200 and the text `ok`
- **THEN** `GET /` gets status 200 and `ok`, and a client of `/link` gets `welcome`

#### Scenario: A WebSocket at a different path with a handler

- **WHEN** a program gives a handler and a client asks for a WebSocket at `/links`
- **THEN** the response has status 404, the handler gets no request, and no subsystem is attached to the hub
