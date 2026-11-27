# wishem/hub/construct Specification

## Purpose

Defines the hub of one construct for code in the same process: the subsystems and their kinds, the port that an I/O subsystem uses, the order and the record of inputs, the joined state, and the events of the hub. The connection to a different process belongs to `wishem/hub/link`.

## Requirements

### Requirement: A hub is made from an ordered list of model subsystems

A hub SHALL be made from a list of model subsystems. Each model subsystem SHALL have an ID, the list of the input types that it applies, and the first value of its part of the state. The order of the list SHALL be the order in which the hub gives an input to the model subsystems. The hub SHALL refuse a list in which two subsystems have one ID, or in which an ID or an input type does not have the correct form.

#### Scenario: Two model subsystems

- **WHEN** a hub is made from the model subsystems `store` and `time`
- **THEN** the joined state has the keys `store` and `time`, and each key holds the first value of that subsystem

#### Scenario: Two subsystems with one ID

- **WHEN** a hub is made from two model subsystems that have the ID `store`
- **THEN** the hub is not made, and the error names the ID

#### Scenario: An input type with an incorrect form

- **WHEN** a model subsystem declares the input type `SetField`
- **THEN** the hub is not made, and the error names the input type

### Requirement: An ID and an input type have a fixed form

The ID of a subsystem SHALL be one or more groups of lowercase letters and digits that hyphens join, and it SHALL start with a letter. An input type SHALL be two such names that one slash joins, such as `store/set-field`.

#### Scenario: Correct names

- **WHEN** a model subsystem has the ID `time` and declares the input type `time/set-running`
- **THEN** the hub accepts the two names

### Requirement: An I/O subsystem attaches to a hub and gets a port

An I/O subsystem SHALL be able to attach to a hub at any time before the hub stops. It SHALL give its ID and its kind: input or output. The hub SHALL give it a port. The hub SHALL refuse an ID that a model subsystem or an attached I/O subsystem has. When a port is closed, its ID SHALL be free again, and the port SHALL send no more events.

#### Scenario: A renderer attaches

- **WHEN** an output subsystem with the ID `renderer` attaches to a hub
- **THEN** it gets a port, and the port reads the joined state

#### Scenario: An ID that is in use

- **WHEN** a subsystem attaches with the ID `renderer` while a subsystem with that ID is attached
- **THEN** the hub refuses, and the error names the ID

#### Scenario: A port is closed

- **WHEN** a port is closed, and then the hub applies an input
- **THEN** the listeners of that port get no event, and a new subsystem can attach with the same ID

### Requirement: Only an input subsystem sends inputs

The port of an input subsystem SHALL accept inputs. The port of an output subsystem SHALL reject each input with the reason `not-permitted`. A model subsystem SHALL have no way to send an input.

#### Scenario: An output subsystem sends an input

- **WHEN** an output subsystem sends the input `store/set-field`
- **THEN** the result is a rejection with the reason `not-permitted`, the joined state does not change, and the record does not change

### Requirement: The hub applies inputs one at a time in the order of arrival

The hub SHALL apply the inputs in the order in which the ports get them. The hub SHALL complete one input, with its events, before it starts the next input. An input that a listener sends while the hub applies an input SHALL wait for its turn.

#### Scenario: Two inputs

- **WHEN** an input subsystem sends input A and then input B
- **THEN** each model subsystem gets A before B, and A has the smaller sequence number

#### Scenario: A listener sends an input

- **WHEN** a listener of the applied event of input A sends input B
- **THEN** each other listener gets the applied event of A before the hub applies B

### Requirement: The hub gives an input to each model subsystem that declares its type

The hub SHALL give an accepted input to each model subsystem that declares the type of the input, in the order of the list, and to no other model subsystem. A model subsystem SHALL return the new value of its part. While a model subsystem applies an input, it SHALL be able to read the joined state, and that state SHALL hold the new parts of the model subsystems that are earlier in the order.

#### Scenario: Two subsystems declare one type

- **WHEN** the model subsystems `time` and `physics` are in that order, the two declare `time/advance`, and an input of that type arrives
- **THEN** `time` applies the input first, and `physics` reads the new part of `time` while it applies the input

#### Scenario: A subsystem that does not declare the type

- **WHEN** an input of the type `time/advance` arrives and the model subsystem `store` does not declare it
- **THEN** `store` does not get the input, and its part is the same object as before

### Requirement: The hub rejects an input that cannot be applied

The hub SHALL reject an input with the reason `not-running` when the hub is not started or is stopped, with `unknown-type` when no model subsystem declares its type, and with `invalid` when a model subsystem refuses it. A model subsystem that refuses an input SHALL be able to give a list of problems, and the result SHALL hold that list. A rejected input SHALL change no part of the joined state, SHALL NOT be in the record, and SHALL cause no event.

#### Scenario: A type that no subsystem declares

- **WHEN** an input subsystem sends the input `sound/play` and no model subsystem declares that type
- **THEN** the result is a rejection with the reason `unknown-type`

#### Scenario: The second subsystem refuses

- **WHEN** two model subsystems declare one type, the first one applies an input of that type, and the second one refuses it with one problem
- **THEN** the result is a rejection with the reason `invalid` and that problem, and the part of the first subsystem is the same object as before the input

#### Scenario: An input before the start

- **WHEN** an input subsystem sends an input to a hub that is not started
- **THEN** the result is a rejection with the reason `not-running`

### Requirement: A failure in a model subsystem does not change the construct

When a model subsystem fails with an error that is not a refusal, the hub SHALL change no part of the joined state, SHALL NOT record the input, SHALL give the error to the sender, and SHALL continue to accept inputs.

#### Scenario: A model subsystem throws

- **WHEN** a model subsystem throws an error while it applies an input, and then a correct input arrives
- **THEN** the sender of the first input gets the error, the joined state is the same as before the first input, and the hub applies the second input

### Requirement: The hub keeps the record of the accepted inputs

The hub SHALL give each accepted input a sequence number. The first number SHALL be 1, and each next number SHALL be one more. The hub SHALL keep, for each accepted input, its sequence number, the ID of the subsystem that sent it, its type, and its payload. The record SHALL be the list of these inputs in the order of their sequence numbers. A later change to the object that the sender gave SHALL NOT change the record.

#### Scenario: Three accepted inputs and one rejected input

- **WHEN** a subsystem with the ID `keyboard` sends two correct inputs, one input with a type that no subsystem declares, and one more correct input
- **THEN** the record has three inputs with the sequence numbers 1, 2, and 3, and each one has the source `keyboard`

#### Scenario: The sender changes its object

- **WHEN** a sender changes the payload object after the hub accepted the input
- **THEN** the payload in the record is the same as at the time of the send

### Requirement: The payload of an input is JSON data

The hub SHALL keep the payload of an input as JSON data. An input with no payload SHALL have the payload `null` in the record. The hub SHALL reject an input with the reason `invalid` when JSON cannot hold its payload.

#### Scenario: An input with no payload

- **WHEN** an input subsystem sends an input that has a type and no payload
- **THEN** the input in the record has the payload `null`

#### Scenario: A payload that refers to itself

- **WHEN** an input subsystem sends an input whose payload is an object that holds itself
- **THEN** the result is a rejection with the reason `invalid`, and the record does not change

### Requirement: The same inputs give the same joined state

Two hubs that are made from equal lists of model subsystems, and that get the same inputs in the same order, SHALL have equal joined states and equal records. The I/O subsystems that are attached SHALL NOT change this result.

#### Scenario: A hub with a renderer and a hub with none

- **WHEN** two hubs get the same inputs, and only one of them has an attached output subsystem
- **THEN** the joined states of the two hubs are equal

### Requirement: The joined state has one part for each model subsystem

The joined state SHALL be one value with one key for each model subsystem, under the ID of the subsystem. A read SHALL NOT copy the parts. After an input, a part that the input did not change SHALL be the same object as before, and the joined state that a reader got before the input SHALL NOT change.

#### Scenario: A reader keeps an earlier state

- **WHEN** a reader gets the joined state, and then an input changes the part `time`
- **THEN** the earlier value still holds the earlier part `time`, and a new read gives the new part `time` and the same object for the part `store`

### Requirement: The hub sends the events of the construct

A port SHALL let its subsystem register a listener and remove it. The hub SHALL send the event `started` when it starts, the event `applied` after each accepted input, and the event `stopping` when it stops. The `applied` event SHALL hold the recorded input. When a listener gets an `applied` event, a read SHALL give the joined state after that input. The hub SHALL send no event for one changed value.

#### Scenario: One accepted input

- **WHEN** a listener is registered and the hub accepts an input
- **THEN** the listener gets one `applied` event with the sequence number, the source, the type, and the payload of the input

#### Scenario: A listener is removed

- **WHEN** a listener is removed, and then the hub accepts an input
- **THEN** that listener gets no event

### Requirement: A failure in a listener does not stop the hub

When a listener throws an error, the hub SHALL call each other listener, SHALL keep the input in the record, and SHALL report the error to the code that made the hub.

#### Scenario: One listener of two throws

- **WHEN** two listeners are registered, and the first one throws on an `applied` event
- **THEN** the second listener gets the event, the sender gets an accepted result, and the code that made the hub gets the error

### Requirement: A hub starts one time and stops one time

A hub SHALL accept inputs only between its start and its stop. After the stop, the hub SHALL send no event, each send SHALL be rejected with `not-running`, and an attach SHALL be refused. A read of the joined state and of the record SHALL work in each state of the hub.

#### Scenario: A hub stops

- **WHEN** a hub with one registered listener stops
- **THEN** the listener gets the event `stopping`, and a later input is rejected with the reason `not-running`

#### Scenario: A listener stops the hub

- **WHEN** a listener of an applied event stops the hub
- **THEN** each other listener gets that applied event, and then the event stopping

#### Scenario: A read after the stop

- **WHEN** a hub is stopped
- **THEN** a read gives the last joined state, and the record holds each accepted input

### Requirement: The hub runs with no Node.js API

The code of the hub SHALL use only the standard library of the language. It SHALL NOT use an API of Node.js or of a web browser.

#### Scenario: A source file imports a Node.js module

- **WHEN** a source file of the hub package imports `node:fs`
- **THEN** the build of the package fails
