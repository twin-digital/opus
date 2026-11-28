# Spec Delta

## Purpose

Defines the remote port in GDScript: how a Godot process opens a link to a hub in a Node.js process, keeps the joined state, gives its subsystems the operations of a port, and opens a new link after a link ends.

## ADDED Requirements

### Requirement: The remote port follows the document of the protocol

The remote port SHALL use protocol version 1 of `nodejs/wishem/hub/LINK.md`. It SHALL send each message as a WebSocket text message. It SHALL accept a `welcome` message of at least 1 MiB.

#### Scenario: The examples of the document

- **WHEN** the remote port gets each message of the full example of `LINK.md` in order
- **THEN** it sends the messages of the client of that example, and its joined state is equal to the state of the example after each message

#### Scenario: A large joined state

- **WHEN** the `welcome` message holds a joined state of 1 MiB
- **THEN** the remote port gives the link to its subsystems with that joined state

### Requirement: The remote port opens a link with its subsystems

The remote port SHALL send `hello` with one or more subsystems, each an output or an input subsystem. The ID of each subsystem SHALL be `<prefix>-<16 lowercase hex digits>`, new for each link. The remote port SHALL send no other message before `welcome`. After `welcome`, it SHALL give one port for each subsystem, in the order of the subsystems.

#### Scenario: The welcome arrives

- **WHEN** the remote port opens a link with an output subsystem with the prefix `godot-screen` and the hub side answers with `welcome`
- **THEN** the port of the subsystem reads the joined state of the `welcome`, and the hub has an output subsystem whose ID matches `godot-screen-[0-9a-f]{16}`

#### Scenario: An empty list of subsystems

- **WHEN** code makes a remote port with no subsystem
- **THEN** the remote port reports an error and opens no connection

### Requirement: The remote port keeps the joined state

For each `applied` message, the remote port SHALL replace each part that the message holds and keep each other part as the same object. Then it SHALL give the event `applied` with the recorded input to each listener of each port, in the order of registration. It SHALL give the events `started` and `stopping`.

#### Scenario: A part that did not change

- **WHEN** an `applied` message holds the part `time` and not the part `store`
- **THEN** `read()` after the event gives a new part `time` and the same object for the part `store`

#### Scenario: A rewind

- **WHEN** the remote port gets an `applied` message with the input `hub/rewind` and the parts that the rewind changed
- **THEN** `read()` gives the state after the target of the rewind, and each listener gets one event `applied`

### Requirement: The remote port checks the order of the messages

The remote port SHALL close the connection and treat the link as ended when the sequence number of an `applied` message is not the last number plus 1, when the first message is not `welcome` or `refused`, when a message is not a JSON object with a text `t`, or when `welcome` has a different protocol version. It SHALL ignore a message of an unknown type after `welcome`, and each unknown key.

#### Scenario: A gap in the sequence numbers

- **WHEN** the last sequence number is 4 and an `applied` message has the number 6
- **THEN** the remote port closes the connection and opens a new link

#### Scenario: An unknown type

- **WHEN** the remote port gets a message with the type `apply` after `welcome`
- **THEN** the link stays open and the joined state does not change

### Requirement: An input subsystem sends inputs through the remote port

The port of an input subsystem SHALL send `submit` with a request number that starts at 1 and goes up by 1, and SHALL give the result of the matching `result` message. The port of an output subsystem SHALL give `not-permitted` and send nothing. When the link ends before the result, the port SHALL give a failure and SHALL NOT send the input again.

#### Scenario: An accepted input

- **WHEN** an input port sends `time/advance` and the hub side answers with `result` and `{ "ok": true, "seq": 4 }`
- **THEN** the port gives `{ "ok": true, "seq": 4 }`, after the event `applied` of that input

#### Scenario: The link ends while an input waits

- **WHEN** an input port sends an input and the connection closes before the `result`
- **THEN** the port gives a failure, and the next link sends no `submit` for that input

### Requirement: The remote port connects again after a link ends

When a link ends, or an attempt fails, the remote port SHALL report the loss one time and keep the last joined state for reading. It SHALL try again after 500 milliseconds, double the wait after each failed attempt up to 5 seconds, and wait 500 milliseconds again after a `welcome`. A `refused` message SHALL count as a failed attempt. Each subsystem SHALL keep one ID for the life of the remote port. The remote port SHALL make new IDs only after the hub side refuses a `hello` with `id-in-use`.

#### Scenario: The hub side stops and starts

- **WHEN** the remote port has a link, the hub side stops, and a new hub side starts at the same address
- **THEN** the remote port reports one loss, opens a new link with the same subsystem IDs, and gives the ports of the new link

#### Scenario: The same IDs after a new link

- **WHEN** a link ends and the remote port opens a new link
- **THEN** the `hello` of the new link holds the same subsystem IDs as the `hello` of the link before

#### Scenario: New IDs after id-in-use

- **WHEN** the hub side refuses a `hello` with `id-in-use`
- **THEN** the remote port makes new subsystem IDs for the next link, and keeps them for the links after it

#### Scenario: The waits

- **WHEN** the hub side is not reachable
- **THEN** the remote port tries again after 500 milliseconds, 1 second, 2 seconds, 4 seconds, and then each 5 seconds

### Requirement: The remote port can be closed

When code closes the remote port, the remote port SHALL close the connection, open no new link, and give no port and no report of a loss after that. A second close SHALL do nothing.

#### Scenario: A close during a wait

- **WHEN** the remote port waits to try again and code closes it
- **THEN** no attempt follows, and no port and no loss are reported
