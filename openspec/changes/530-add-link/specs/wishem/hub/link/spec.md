# Spec Delta

## Purpose

Defines the link between a hub and the subsystems of a process that has no hub: the messages of the protocol, its version, the start and the end of a link, and the behavior of a remote port. The hub itself belongs to `wishem/hub/construct`. The server that accepts a connection belongs to the process that holds the hub.

## ADDED Requirements

### Requirement: A link is a sequence of JSON messages on one connection

A link SHALL use one connection that carries text messages in order in each direction. Each message SHALL be one JSON object with a key `t` that holds the type of the message. The side that holds the subsystems is the client. The side that holds the hub is the hub side.

#### Scenario: A message that is not a JSON object

- **WHEN** the hub side gets a message that is not a JSON object with a string `t`
- **THEN** the hub side sends a `refused` message with the reason `malformed` and closes the connection

### Requirement: The client starts a link with a hello message

The first message of the client SHALL be `hello`. It SHALL hold the version of the protocol and the list of the subsystems of the client, each with an ID and a kind. The version of this protocol SHALL be 1. The hub side SHALL attach each subsystem to the hub and SHALL answer with one `welcome` message.

#### Scenario: A page with two subsystems

- **WHEN** a client sends `hello` with version 1 and the subsystems `page` (output) and `page-controls` (input)
- **THEN** the two subsystems are attached to the hub, and the client gets one `welcome` message

#### Scenario: A message before the hello

- **WHEN** the first message of a client is `submit`
- **THEN** the hub side sends `refused` with the reason `malformed` and closes the connection

### Requirement: The welcome message holds the joined state

The `welcome` message SHALL hold the version of the protocol, the status of the hub, the sequence number of the last accepted input (0 when no input was accepted), and the full joined state. Each event that the hub sends after it made the `welcome` message SHALL follow on the link, and the client SHALL miss no event.

#### Scenario: A link starts after three inputs

- **WHEN** a hub accepted three inputs, and then a client starts a link
- **THEN** the `welcome` message has the sequence number 3 and the joined state after the third input, and the next `applied` message has the sequence number 4

### Requirement: The hub side refuses a hello that it cannot serve

The hub side SHALL answer a `hello` with a `refused` message and SHALL close the connection in each of these cases: the version is not one that the hub side supports (reason `version`, with the list of supported versions), the list of subsystems is empty or an entry is not correct (reason `malformed`), an ID is in use (reason `id-in-use`), a subsystem has the kind `model` (reason `unsupported`), or the hub is stopped (reason `stopped`). A `refused` message SHALL hold a text that says what is not correct. When the hub side refuses, it SHALL attach none of the subsystems.

#### Scenario: A client with a newer protocol

- **WHEN** a client sends `hello` with version 2
- **THEN** the client gets `refused` with the reason `version` and the list `[1]`, and the connection closes

#### Scenario: One ID of two is in use

- **WHEN** a client sends `hello` with the subsystems `page` and `keyboard`, and a subsystem with the ID `keyboard` is attached to the hub
- **THEN** the client gets `refused` with the reason `id-in-use`, and `page` is not attached to the hub

#### Scenario: A model subsystem

- **WHEN** a client sends `hello` with a subsystem of the kind `model`
- **THEN** the client gets `refused` with the reason `unsupported`

### Requirement: The hub side sends each event one time for each link

The hub side SHALL send one `event` message for the `started` event and for the `stopping` event of the hub, and one `applied` message for each accepted input. A link SHALL get each event one time, also when the link carries more than one subsystem. After the `stopping` event, the hub side SHALL close the connection.

#### Scenario: A link with two subsystems

- **WHEN** a link carries two subsystems, and the hub accepts one input
- **THEN** the client gets one `applied` message

#### Scenario: The hub stops

- **WHEN** the hub stops
- **THEN** the client gets one `event` message with `stopping`, and then the connection closes

### Requirement: An applied message holds the input and the parts that changed

An `applied` message SHALL hold the recorded input and the new value of each part of the joined state that changed since the last state that the hub side sent on this link. It SHALL hold no part that did not change.

#### Scenario: An input changes one part of two

- **WHEN** the joined state has the parts `store` and `time`, and an input changes only `time`
- **THEN** the `applied` message holds the input and the part `time`, and it does not hold `store`

### Requirement: The client sends inputs with a request number

A `submit` message SHALL hold a request number that the client selects, the ID of the sending subsystem, and the input. The hub side SHALL give the input to the port of that subsystem and SHALL answer with one `result` message that holds the same request number and the result of the hub. When the ID is not a subsystem of this link, the result SHALL be a rejection with the reason `not-permitted`. When the hub fails with an error, the `result` message SHALL hold the text of the error in place of a result.

#### Scenario: An accepted input

- **WHEN** a client sends `submit` with the request number 7 for its input subsystem `keyboard`
- **THEN** the record of the hub holds the input with the source `keyboard`, and the client gets `result` with the request number 7 and the sequence number of the input

#### Scenario: The applied message comes before the result

- **WHEN** a client sends an input that the hub accepts
- **THEN** the client gets the `applied` message of that input before the `result` message

#### Scenario: A subsystem of a different link

- **WHEN** a client sends `submit` with the ID of a subsystem that its `hello` did not name
- **THEN** the client gets `result` with a rejection that has the reason `not-permitted`

### Requirement: The end of a connection detaches the subsystems

When a connection closes, for each cause, the hub side SHALL close the port of each subsystem of that link. The IDs SHALL be free for a new link. The hub SHALL continue.

#### Scenario: A page closes

- **WHEN** a client with the subsystem `page` closes its connection, and then a new client sends `hello` with the subsystem `page`
- **THEN** the new client gets a `welcome` message

### Requirement: A side ignores a message type that it does not know

After the start of a link, a side that gets a message with a type that it does not know SHALL ignore the message and SHALL keep the link open. The types `apply` and `part` are reserved for a model subsystem in the process of the client.

#### Scenario: An unknown message from the hub side

- **WHEN** a client gets a message with the type `future-thing` after the `welcome` message
- **THEN** the client keeps the link open, and the next `applied` message changes its state as usual

### Requirement: A remote port has the behavior of a port

The remote port SHALL give, for each subsystem of the client, a port with the same operations as a port in the process of the hub: send an input, read the joined state, and register a listener. A read SHALL give the state of the last message that the client got, with no wait. A part that an `applied` message did not hold SHALL be the same object as before. When a listener gets an `applied` event, a read SHALL give the state after that input.

#### Scenario: A read after an applied message

- **WHEN** a remote port gets an `applied` message that holds the part `time`
- **THEN** a read gives the new part `time`, and the part `store` is the same object as before the message

#### Scenario: An input through a remote port

- **WHEN** a subsystem sends an input through the remote port of an input subsystem, and the hub accepts it
- **THEN** the send gives the same result that a port in the process of the hub gives

#### Scenario: An input through the remote port of an output subsystem

- **WHEN** a subsystem sends an input through the remote port of an output subsystem
- **THEN** the send gives a rejection with the reason `not-permitted`

### Requirement: A remote port reports the end of its link

The code that opens a link SHALL get a failure with the reason and the text of the `refused` message when the hub side refuses the `hello`. After the start, the code SHALL be able to learn that the link ended. When a link ends, each send that has no result SHALL fail, each later send SHALL be rejected with the reason `not-running`, and a read SHALL give the last state. A remote port SHALL end its link when a sequence number is not one more than the last one.

#### Scenario: The connection is lost

- **WHEN** the connection of a remote port closes while one send has no result
- **THEN** that send fails, the code that opened the link learns that the link ended, and a read gives the last state

#### Scenario: A missing input

- **WHEN** a remote port that has the sequence number 4 gets an `applied` message with the sequence number 6
- **THEN** the remote port closes the connection and reports that the link ended

### Requirement: The link runs on a WebSocket and in memory

The package SHALL give a channel for a WebSocket that has the interface of the web platform, and a pair of connected channels in memory. The code of the link SHALL use no API of Node.js and no type of a web browser.

#### Scenario: A hub and a remote port in one test

- **WHEN** a test connects the hub side and a remote port with the pair of channels in memory
- **THEN** the remote port gets the `welcome` message and each later event

### Requirement: The protocol has a document for a client in a different language

The package SHALL hold a document of the protocol. The document SHALL give each message with each key and its type, the order of the messages, each reason of a `refused` message, and one full example of a link. The examples of the document SHALL be messages that the tests of the package also use.

#### Scenario: A message changes

- **WHEN** a change adds a key to the `welcome` message and does not change the example of the document
- **THEN** a test of the package fails
