# Spec Delta

## Purpose

Defines the construct manager of the workbench construct: how it starts and stops each product construct that the construct list names, what a product construct holds, how it gives the product model to a product construct, how it passes inputs, how it reports a status, and how it stops with the workbench.

## ADDED Requirements

### Requirement: The construct manager attaches two subsystems to the workbench

The construct manager SHALL attach the input subsystem `construct-manager` and the output subsystem `construct-manager-reader` to the workbench hub. It SHALL communicate with the workbench construct only through these two ports. It SHALL send no input to a store of the workbench construct.

#### Scenario: The subsystems of the workbench

- **WHEN** the workbench starts with a mounted product
- **THEN** the subsystems `construct-manager` and `construct-manager-reader` are attached to the workbench hub, and each report in the record has the source `construct-manager`

### Requirement: The construct manager starts each construct that is wanted to run

For each construct of the list that is wanted to run and has no product construct, the construct manager SHALL start one product construct in the process of the workbench. When the product construct serves its link, the construct manager SHALL report the status `running` with the address of the link and the time state. When the start fails, it SHALL report the status `failed` with a message.

#### Scenario: A start

- **WHEN** an input subsystem sends `constructs/start` with the construct `play`
- **THEN** the part `constructs` holds `play` with the status `running` and an address `ws://127.0.0.1:<port>/link`, and a client of that address gets a `welcome` message

#### Scenario: Two constructs

- **WHEN** an input subsystem starts the constructs `play` and `check`
- **THEN** each one has its own address, and an input to one changes only that one

#### Scenario: A start that fails

- **WHEN** the rules of the product throw an error when the construct manager makes the hub of `play`
- **THEN** the part holds `play` with the status `failed` and the text of the error, and the workbench continues

### Requirement: A product construct holds the product and no storage

A product construct SHALL have the model subsystems `time` and `store`, in this order. The store SHALL start from the product model at the start, wrapped by the rules of the product when the workbench has them. A product construct SHALL have a clock and SHALL have no storage subsystem. A product construct SHALL write no file.

#### Scenario: The sample product with its rules

- **WHEN** the workbench has the product code of the sample product, a construct runs for 500 milliseconds of real time, and a client reads it
- **THEN** the part `store` holds the entity of the product with a count larger than `0`, and the part `time` has `running` set to `true`

#### Scenario: A product with no rules

- **WHEN** the workbench has no product code, and a construct runs for 500 milliseconds
- **THEN** the part `time` has more than 0 ticks, and the count is the count of the product model

#### Scenario: No file changes

- **WHEN** a construct runs, gets inputs, and is rewound
- **THEN** the `state.json` of the product folder does not change

### Requirement: The construct manager sends each change of the product model

After each input after which the part `product` of the workbench is a different object, the construct manager SHALL send the change to each running product construct, with the source `construct-manager`. When only field values of entities that the two models both hold differ, it SHALL send one `store/set-field` for each changed value, and a value that the change did not touch SHALL keep its live value. For each other change, it SHALL send one `store/replace-model` with the product model.

#### Scenario: A hand edit of a value

- **WHEN** a construct of the sample product runs with a count of `25`, and a person changes the color in the `state.json` of the product folder to `#b91c1c`
- **THEN** the store of the construct holds `#b91c1c`, its record holds one `store/set-field` with the source `construct-manager`, and the count continues from its live value

#### Scenario: An input to the product

- **WHEN** a construct runs, and an input subsystem sends `product/set-field` that sets the count to `100` in the workbench
- **THEN** the store of the construct holds the count `100` or a count that the ticks added to `100`

#### Scenario: A change of a definition

- **WHEN** a construct runs, and the label of a component type of the product model changes
- **THEN** the construct gets one `store/replace-model` with the product model, and its entities are the entities of the product model

#### Scenario: A rewind of the workbench

- **WHEN** an input changed a value of the product, and `hub/rewind` of the workbench returns the part `product` to the value before that input
- **THEN** the construct gets one `store/set-field` with the earlier value, and its record holds no rewind

#### Scenario: A change that the construct refuses

- **WHEN** the construct refuses an input of a change
- **THEN** the construct manager reports the message of the refusal for that construct, and it sends the next change

### Requirement: The construct manager passes inputs

After the workbench hub applies `constructs/send`, the construct manager SHALL send its input to the product construct with the source `construct-manager`. It SHALL report the result with the sequence number of the `constructs/send` in the workbench record. A rewind or a replay of the workbench SHALL NOT send an input again.

#### Scenario: A pause

- **WHEN** an input subsystem sends `constructs/send` with `play` and `time/set-running` with `false`
- **THEN** the part `time` of `play` has `running` set to `false`, the clock of `play` sends no tick, and the part `constructs` holds `play` with the time state `paused` and the result `ok`

#### Scenario: A step

- **WHEN** `play` is paused, and an input subsystem sends `constructs/send` with `time/advance` of 50 milliseconds
- **THEN** the count of `play` is one more than before

#### Scenario: A rewind of a product construct

- **WHEN** `play` accepted 40 inputs, and an input subsystem sends `constructs/send` with `hub/rewind` to the sequence number 10
- **THEN** the joined state of `play` is equal to its state after the input 10, and no file changes

#### Scenario: An input that the product construct refuses

- **WHEN** an input subsystem sends `constructs/send` with the input `sound/play`
- **THEN** the part holds `play` with a result that has the reason `unknown-type`

#### Scenario: A rewind of the workbench past a send

- **WHEN** an input subsystem sent `constructs/send` that paused `play`, and `hub/rewind` of the workbench returns to the state before it
- **THEN** the construct manager sends no input to `play`

### Requirement: Only the construct manager rewinds a product construct

A product construct SHALL accept `hub/rewind` only from the source `construct-manager`. It SHALL refuse `hub/rewind` from each other subsystem with the reason `not-permitted`. Each other input type SHALL be accepted from each input subsystem of the product link.

#### Scenario: A rewind through the product link

- **WHEN** a client of the link of `play` sends `hub/rewind`
- **THEN** the result is a rejection with the reason `not-permitted`, and the joined state of `play` does not change

#### Scenario: A step through the product link

- **WHEN** a client of the link of `play` sends `time/advance`
- **THEN** the product construct accepts the input

### Requirement: The construct manager stops a construct that is not wanted

When a construct of the list is not wanted to run and has a product construct, the construct manager SHALL stop its clock and its hub, close its link, release its port, and report the status `stopped`. A new start of the same ID SHALL start a new product construct from the product model at that time, with a new record.

#### Scenario: A stop

- **WHEN** `play` runs, and an input subsystem sends `constructs/stop` with `play`
- **THEN** each client of the link of `play` gets the `stopping` event, the address of `play` accepts no connection, and the part holds `play` with the status `stopped`

#### Scenario: A stop and a start

- **WHEN** `play` ran with ticks and was stopped, and an input subsystem sends `constructs/start` with `play`
- **THEN** the store of the new `play` starts from the product model, and its record starts at the sequence number 0

### Requirement: The construct manager follows the list after a rewind

After each applied input of the workbench, the construct manager SHALL compare the construct list with the product constructs that run. It SHALL start each construct that is wanted to run and does not run, stop each product construct that is not wanted, and report the real status of each construct whose reported status is not true.

#### Scenario: A rewind of the workbench before a start

- **WHEN** `play` runs, and `hub/rewind` of the workbench returns to the state before `constructs/start` of `play`
- **THEN** the construct manager stops the product construct of `play`

#### Scenario: A rewind to a status that is not true

- **WHEN** `play` was stopped, and `hub/rewind` of the workbench returns to a state in which `play` is wanted to stop and has the status `running`
- **THEN** the construct manager reports the status `stopped` for `play`

### Requirement: The product constructs stop with the workbench

When the workbench stops, the construct manager SHALL stop each product construct before the workbench hub stops, and SHALL close its two ports. The product constructs and the construct list SHALL NOT be kept. A new start of the workbench SHALL have no product construct.

#### Scenario: The person stops the workbench

- **WHEN** `play` runs, and the person sends an interrupt signal to the `start` script of the workbench page
- **THEN** a client of the link of `play` gets the `stopping` event, the address of `play` accepts no connection, and the command stops with exit code 0

### Requirement: The terminal shows each change of a product construct

The construct manager SHALL print one line when a product construct starts, with its ID and the address of its link, one line when it stops, one line when its start fails, with the reason, and one line when it refuses a change of the product model, with the reason.

#### Scenario: A start and a stop

- **WHEN** an input subsystem starts `play` and then stops it
- **THEN** the terminal shows `wishem: construct play runs, link at ws://127.0.0.1:<port>/link` and then `wishem: construct play stopped`
