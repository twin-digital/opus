# wishem/hub/record Specification

## Purpose

Defines the record of a hub and what uses it: the start and the limit of the record, the checkpoints, the input `hub/rewind` that returns a construct to an earlier point, and the replay of a record in a new hub.

## Requirements

### Requirement: The record holds the accepted inputs after its start

The record SHALL have a start and a list of inputs. The start SHALL hold a sequence number and the joined state after the input with that number. For a new hub, the start SHALL have the number 0 and the first joined state. The list SHALL hold each accepted input after the start, in the order of the sequence numbers, with no gap.

#### Scenario: A new hub with three inputs

- **WHEN** a new hub accepts three inputs
- **THEN** the start of the record has the number 0 and the first joined state, and the list holds the inputs 1, 2, and 3

### Requirement: The hub gives the last sequence number with no copy of the record

The hub SHALL give the sequence number of the last accepted input as one value. The value SHALL be 0 when the hub accepted no input. A read of the value SHALL NOT copy the record.

#### Scenario: After two inputs

- **WHEN** a hub accepts two inputs and rejects one input
- **THEN** the last sequence number is 2

### Requirement: The record has a limit

The code that makes a hub SHALL be able to give the largest number of inputs in the record. The default SHALL be 100000. When the list holds more inputs than the limit, the hub SHALL move the start of the record to a checkpoint, SHALL remove each input up to that checkpoint, and SHALL remove each checkpoint before it. After an accepted input, the list SHALL hold no more inputs than the limit.

#### Scenario: A record that is too long

- **WHEN** a hub has a limit of 200 and a checkpoint interval of 100, and it accepts 250 inputs
- **THEN** the start of the record has the number 100, the list holds the inputs 101 to 250, and the start holds the joined state after the input 100

#### Scenario: A limit that is smaller than the checkpoint interval

- **WHEN** the code makes a hub with a limit of 50 and a checkpoint interval of 100
- **THEN** the hub is not made, and the error names the two options

### Requirement: The hub keeps checkpoints

A checkpoint SHALL be the joined state after one sequence number. The hub SHALL keep a checkpoint at the start of the record, after each input whose sequence number is a multiple of the checkpoint interval, and after each rewind. The default interval SHALL be 100. A checkpoint SHALL refer to the parts of the joined state and SHALL NOT copy them.

#### Scenario: A checkpoint refers to the parts

- **WHEN** a hub with a checkpoint interval of 10 accepts 15 inputs, and then rewinds to the input 10
- **THEN** each part of the joined state is the same object as that part after the input 10

### Requirement: The ID hub and the input types of the hub are reserved

The ID `hub` SHALL belong to the hub. The hub SHALL refuse a model subsystem or an I/O subsystem with the ID `hub`, and a model subsystem that declares an input type that starts with `hub/`. The hub SHALL apply the input type `hub/rewind` itself. The hub SHALL reject each other input type that starts with `hub/` with the reason `unknown-type`.

#### Scenario: A model subsystem with the ID hub

- **WHEN** the code makes a hub with a model subsystem that has the ID `hub`
- **THEN** the hub is not made, and the error names the ID

#### Scenario: A model subsystem declares a type of the hub

- **WHEN** a model subsystem `store` declares the input type `hub/rewind`
- **THEN** the hub is not made, and the error names the input type

#### Scenario: An unknown type of the hub

- **WHEN** an input subsystem sends the input `hub/undo`
- **THEN** the result is a rejection with the reason `unknown-type`

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

### Requirement: A rewind restores the last checkpoint and applies the inputs after it

For a rewind, the hub SHALL take the last checkpoint at or before the target, and SHALL give each input after the checkpoint up to the target to the model subsystems again, in the order of the record. A part that no input after the checkpoint changes SHALL be the same object as in the checkpoint.

#### Scenario: A target between two checkpoints

- **WHEN** a hub with a checkpoint interval of 10 accepts 25 inputs, and then rewinds to the input 17
- **THEN** the model subsystems get the inputs 11 to 17 again and no other input, and the joined state is equal to the joined state after the input 17

### Requirement: The hub rejects a rewind that it cannot do

The hub SHALL reject a `hub/rewind` with the reason `invalid` and a problem at the path `payload.seq` when the target is not an integer, is before the start of the record, or is after the last sequence number. A rejected rewind SHALL change nothing. When a model subsystem throws an error while the hub applies an input again, the hub SHALL change nothing and SHALL give the error to the sender.

#### Scenario: A target before the start of the record

- **WHEN** the start of the record has the number 100, and an input subsystem sends `hub/rewind` with the target 40
- **THEN** the result is a rejection with the reason `invalid`, and the record does not change

#### Scenario: A target after the last input

- **WHEN** the last sequence number is 4, and an input subsystem sends `hub/rewind` with the target 9
- **THEN** the result is a rejection with the reason `invalid`

### Requirement: A new hub can start from a record

The code that makes a hub SHALL be able to give a record. The hub SHALL take the start of the record as its first joined state and as its first checkpoint, and SHALL apply each input of the record in order, with its sequence number and its source, before the hub starts. The hub SHALL send no event for these inputs. The new hub SHALL have the same joined state and the same last sequence number as the hub that made the record.

#### Scenario: A replay

- **WHEN** a hub accepts inputs, and the code makes a second hub with equal model subsystems and the record of the first hub
- **THEN** the joined states of the two hubs are equal, and the next input of the second hub gets the next sequence number of the first hub

#### Scenario: A replay with a rewind in the record

- **WHEN** the record holds a `hub/rewind` input, and a new hub starts from that record
- **THEN** the joined state of the new hub is equal to the joined state of the first hub

### Requirement: The limit of the record does not stop a replay

The hub SHALL NOT move the start of the record while it applies the record that it got, so each rewind of that record applies. When the limit of the new hub is not less than the number of inputs that it got, the new hub SHALL have the same record. When the limit is less, the new hub SHALL apply its limit one time after the last input.

#### Scenario: A replay in a hub with a smaller limit

- **WHEN** a hub with a limit of 1000 applies 30 inputs and then a rewind to the sequence number 5, and a new hub with a limit of 20 starts from that record
- **THEN** the replay does not fail, the joined state and the last sequence number of the new hub are equal to those of the first hub, and the record of the new hub holds 20 inputs or fewer

#### Scenario: A replay in a hub with an equal limit

- **WHEN** a new hub with the limit of the first hub starts from the record of the first hub
- **THEN** `record()` and `recordStart()` of the new hub are equal to those of the first hub

### Requirement: A record that does not apply stops the replay

The hub SHALL NOT be made when a model subsystem refuses an input of the record, or throws while it applies one. The error SHALL hold the sequence number of that input and the problems. The hub SHALL NOT be made when the start of the record has a key that is not a model subsystem or lacks one, or when the sequence numbers of the record have a gap.

#### Scenario: A changed subsystem refuses an input

- **WHEN** the code makes a hub from a record whose input 3 the new model subsystems refuse
- **THEN** the hub is not made, and the error holds the sequence number 3 and the problems of the refusal

#### Scenario: A gap in the record

- **WHEN** the code makes a hub from a record whose inputs have the sequence numbers 1, 2, and 4
- **THEN** the hub is not made, and the error names the number 4

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
