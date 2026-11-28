# Spec Delta

## MODIFIED Requirements

### Requirement: The protocol has a document for a client in a different language

The package SHALL hold a document of the protocol. The document SHALL give each message with each key and its type, the order of the messages, each reason of a `refused` message, and one full example of a link. The examples of the document SHALL be messages that the tests of the package also use. The document SHALL also give the address of a link, the kind of WebSocket message, the size of a message, the form of the numbers, and each value that a client can get.

#### Scenario: A message changes

- **WHEN** a change adds a key to the `welcome` message and does not change the example of the document
- **THEN** a test of the package fails

#### Scenario: A client in GDScript

- **WHEN** a person writes a remote port in GDScript with only the document, a WebSocket, and a JSON parser
- **THEN** the remote port opens a link to a hub in a Node.js process, keeps the joined state, and opens a new link after the hub side stops and starts

#### Scenario: A binary message

- **WHEN** a client sends a message as a binary WebSocket message
- **THEN** the document says that the hub side ignores it and sends no answer, and that each message is a text message

#### Scenario: A JSON parser that gives only floating-point numbers

- **WHEN** the JSON parser of a client gives each number as a floating-point number
- **THEN** the document says that each number of version 1 is an integer, and that a client converts it to an integer before it compares or sends it
