# Spec Delta

## MODIFIED Requirements

### Requirement: A rewind returns the construct to an earlier point

The input `hub/rewind` SHALL hold a target sequence number. The hub SHALL accept it from an input subsystem like each other input, except when the code that made the hub limits the sources of a rewind, as "A hub can limit the sources of a rewind" defines. The hub SHALL make the joined state equal to the joined state after the target. The rewind SHALL get the next sequence number, SHALL be in the record, and SHALL cause one `applied` event. A rewind SHALL NOT remove an input from the record.

#### Scenario: A rewind after five inputs

- **WHEN** a hub accepts five inputs, and then an input subsystem sends `hub/rewind` with the target 2
- **THEN** the result is accepted with the sequence number 6, the joined state is equal to the joined state after the input 2, and the record holds the inputs 1 to 6

#### Scenario: A rewind to the start

- **WHEN** a new hub accepts three inputs, and then gets `hub/rewind` with the target 0
- **THEN** the joined state is equal to the first joined state

#### Scenario: A rewind to a point after an earlier rewind

- **WHEN** a hub accepts the inputs 1 to 5, the input 6 rewinds to 2, and the input 7 rewinds to 5
- **THEN** the joined state is equal to the joined state after the input 5

#### Scenario: A listener after a rewind

- **WHEN** a listener is registered and the hub accepts a rewind
- **THEN** the listener gets one `applied` event that holds the input `hub/rewind`, and a read gives the joined state after the rewind

## ADDED Requirements

### Requirement: A hub can limit the sources of a rewind

The code that makes a hub SHALL be able to give a list of the IDs of the subsystems that can send `hub/rewind`. When the list is given, the hub SHALL reject `hub/rewind` from each other subsystem with the reason `not-permitted`, and the rejection SHALL change nothing. With no list, each input subsystem SHALL be able to send it. The list SHALL NOT apply to the record that a new hub replays.

#### Scenario: A source in the list

- **WHEN** a hub is made with the rewind sources `construct-manager`, and the input subsystem `construct-manager` sends `hub/rewind`
- **THEN** the hub accepts the rewind

#### Scenario: A source that is not in the list

- **WHEN** a hub is made with the rewind sources `construct-manager`, and the input subsystem `keys` sends `hub/rewind`
- **THEN** the result is a rejection with the reason `not-permitted`, the joined state does not change, and the record does not change

#### Scenario: A different input from a source that is not in the list

- **WHEN** a hub is made with the rewind sources `construct-manager`, and the input subsystem `keys` sends `time/advance`
- **THEN** the hub accepts the input

#### Scenario: A rewind through the link

- **WHEN** a hub is made with the rewind sources `construct-manager`, and a client of the link sends `hub/rewind`
- **THEN** the client gets a `result` message with a rejection that has the reason `not-permitted`

#### Scenario: A replay of a rewind

- **WHEN** a new hub with the rewind sources `construct-manager` starts from a record that holds a `hub/rewind` from the source `keys`
- **THEN** the new hub applies the record, and its joined state is equal to the joined state of the first hub

#### Scenario: A list that is not correct

- **WHEN** the code makes a hub with a rewind source that does not have the form of an ID
- **THEN** the hub is not made, and the error names the source
