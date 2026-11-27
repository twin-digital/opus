# Spec Delta

## MODIFIED Requirements

### Requirement: The server is local

The server SHALL listen only on the loopback address `127.0.0.1`. A program on a different computer SHALL NOT be able to connect.

#### Scenario: A request from the same computer

- **WHEN** the server runs on port 4747 and a program on the same computer opens a WebSocket to `ws://127.0.0.1:4747/link`
- **THEN** the connection opens

#### Scenario: A request to a different address of the computer

- **WHEN** a program connects to port 4747 on a network address of the computer that is not the loopback address
- **THEN** the connection is refused

## ADDED Requirements

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

## REMOVED Requirements

### Requirement: The server stops cleanly

**Reason**: The server has no stream. It carries links, and the stop of a link is the `stopping` event of the hub.

**Migration**: See "The server stops each link cleanly".

### Requirement: The current snapshot through HTTP

**Reason**: A client reads the model through a link. The `welcome` message of a link holds the joined state, and its part `store` holds the model.

**Migration**: Open a WebSocket to `ws://127.0.0.1:4747/link`, send `hello` with one output subsystem, and read the part `store` of the `welcome` message. See "The server carries the link at /link".

### Requirement: Each new snapshot through Server-Sent Events

**Reason**: The link sends an `applied` message with each part that changed. One protocol serves each client, also a client in a different language.

**Migration**: Keep the link open and apply the `parts` of each `applied` message to the local state, by `wishem/hub/link`. A TypeScript client uses `openLink` of `@thrashplay/wishem-hub`.
