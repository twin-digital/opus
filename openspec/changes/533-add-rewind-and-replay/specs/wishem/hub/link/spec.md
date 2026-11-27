# Spec Delta

## MODIFIED Requirements

### Requirement: The hub side refuses a hello that it cannot serve

The hub side SHALL answer a `hello` that it cannot serve with a `refused` message, SHALL close the connection, and SHALL attach none of the subsystems. The message SHALL hold a reason and a text that says what is not correct. The reasons SHALL be `version`, with the list of supported versions, `malformed` for a list of subsystems that is empty or not correct, `id-in-use`, `unsupported` for a subsystem of the kind `model`, and `stopped` for a hub that is stopped.

#### Scenario: A client with a newer protocol

- **WHEN** a client sends `hello` with version 2
- **THEN** the client gets `refused` with the reason `version` and the list `[1]`, and the connection closes

#### Scenario: One ID of two is in use

- **WHEN** a client sends `hello` with the subsystems `page` and `keyboard`, and a subsystem with the ID `keyboard` is attached to the hub
- **THEN** the client gets `refused` with the reason `id-in-use`, and `page` is not attached to the hub

#### Scenario: A model subsystem

- **WHEN** a client sends `hello` with a subsystem of the kind `model`
- **THEN** the client gets `refused` with the reason `unsupported`

#### Scenario: The reserved ID

- **WHEN** a client sends `hello` with an input subsystem that has the ID `hub`
- **THEN** the client gets `refused` with the reason `id-in-use`

### Requirement: The hub side sends each event one time for each link

The hub side SHALL send one `event` message for the `started` event and for the `stopping` event of the hub, and one `applied` message for each accepted input. A link SHALL get each event one time, also when the link carries more than one subsystem. After the `stopping` event, the hub side SHALL close the connection. The hub side SHALL close the connection only for the `stopping` event, and not for a different event.

#### Scenario: A link with two subsystems

- **WHEN** a link carries two subsystems, and the hub accepts one input
- **THEN** the client gets one `applied` message

#### Scenario: The hub stops

- **WHEN** the hub stops
- **THEN** the client gets one `event` message with `stopping`, and then the connection closes

### Requirement: An applied message holds the input and the parts that changed

An `applied` message SHALL hold the recorded input and the new value of each part of the joined state that changed since the last state that the hub side sent on this link. It SHALL hold no part that did not change. A rewind SHALL reach the client as an `applied` message that holds the input `hub/rewind` and each part that the rewind changed, so a client of version 1 SHALL get the state after a rewind with no other message.

#### Scenario: An input changes one part of two

- **WHEN** the joined state has the parts `store` and `time`, and an input changes only `time`
- **THEN** the `applied` message holds the input and the part `time`, and it does not hold `store`

#### Scenario: A rewind on a link

- **WHEN** a client has a link, the hub accepted the inputs 1 to 4, and then the hub accepts a rewind to the input 2
- **THEN** the client gets an `applied` message with the sequence number 5 and the input `hub/rewind`, the link stays open, and a read of the remote port gives the joined state after the input 2
