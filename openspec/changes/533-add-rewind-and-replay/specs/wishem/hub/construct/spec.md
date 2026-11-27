# Spec Delta

## MODIFIED Requirements

### Requirement: An ID and an input type have a fixed form

The ID of a subsystem SHALL be one or more groups of lowercase letters and digits that hyphens join, and it SHALL start with a letter. An input type SHALL be two such names that one slash joins, such as `store/set-field`. The ID `hub` and each input type whose first name is `hub` SHALL be reserved for the hub, as `wishem/hub/record` defines.

#### Scenario: Correct names

- **WHEN** a model subsystem has the ID `time` and declares the input type `time/set-running`
- **THEN** the hub accepts the two names

#### Scenario: The reserved ID

- **WHEN** an output subsystem attaches with the ID `hub`
- **THEN** the hub refuses, and the error names the ID

### Requirement: The hub keeps the record of the accepted inputs

The hub SHALL give each accepted input a sequence number. The first number SHALL be 1, and each next number SHALL be one more. The hub SHALL keep, for each accepted input, its sequence number, the ID of the subsystem that sent it, its type, and its payload. The record SHALL be the list of these inputs after the start of the record, in the order of their sequence numbers, as `wishem/hub/record` defines. A later change to the object that the sender gave SHALL NOT change the record.

#### Scenario: Three accepted inputs and one rejected input

- **WHEN** a subsystem with the ID `keyboard` sends two correct inputs, one input with a type that no subsystem declares, and one more correct input
- **THEN** the record has three inputs with the sequence numbers 1, 2, and 3, and each one has the source `keyboard`

#### Scenario: The sender changes its object

- **WHEN** a sender changes the payload object after the hub accepted the input
- **THEN** the payload in the record is the same as at the time of the send

### Requirement: The hub sends the events of the construct

A port SHALL let its subsystem register a listener and remove it. The hub SHALL send the event `started` when it starts, the event `applied` after each accepted input, and the event `stopping` when it stops. The `applied` event SHALL hold the recorded input. When a listener gets an `applied` event, a read SHALL give the joined state after that input. The hub SHALL send no event for one changed value.

#### Scenario: One accepted input

- **WHEN** a listener is registered and the hub accepts an input
- **THEN** the listener gets one `applied` event with the sequence number, the source, the type, and the payload of the input

#### Scenario: A listener is removed

- **WHEN** a listener is removed, and then the hub accepts an input
- **THEN** that listener gets no event

#### Scenario: A rewind

- **WHEN** a listener is registered and the hub accepts the input `hub/rewind`
- **THEN** the listener gets one `applied` event that holds that input, and no other event

### Requirement: A hub starts one time and stops one time

A hub SHALL accept inputs only between its start and its stop. After the stop, the hub SHALL send no event, each send SHALL be rejected with `not-running`, and an attach SHALL be refused. A read of the joined state, of the last sequence number, and of the record SHALL work in each state of the hub.

#### Scenario: A hub stops

- **WHEN** a hub with one registered listener stops
- **THEN** the listener gets the event `stopping`, and a later input is rejected with the reason `not-running`

#### Scenario: A listener stops the hub

- **WHEN** a listener of an applied event stops the hub
- **THEN** each other listener gets that applied event, and then the event stopping

#### Scenario: A read after the stop

- **WHEN** a hub is stopped
- **THEN** a read gives the last joined state, and the record holds each accepted input after the start of the record

## ADDED Requirements

### Requirement: The hub has three events

The events `started`, `applied`, and `stopping` SHALL be the only events of the hub. A restore of the construct to an earlier point SHALL be the `applied` event of a rewind input, and SHALL NOT be a different event.

#### Scenario: A listener that knows the three events

- **WHEN** a listener handles `started`, `applied`, and `stopping`, and the hub accepts inputs and a rewind and then stops
- **THEN** the listener gets no event of a different type
