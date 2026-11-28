# wishem/workbench/construct-list Specification

## Purpose

Defines the construct list of the workbench construct: the model subsystem that holds each product construct that must run and the status that the construct manager reported for it, its inputs, and what it refuses.

## Requirements

### Requirement: A workbench with a mounted product has the construct list

When the workbench construct mounts a product, it SHALL have a model subsystem with the ID `constructs` after the stores `store` and `product`. Its first part SHALL hold no construct. With no mounted product, the joined state SHALL have no part `constructs`.

#### Scenario: A workbench with the sample product

- **WHEN** the workbench starts with a mounted product
- **THEN** the joined state has the parts `store`, `product`, and `constructs`, and the part `constructs` holds no construct

#### Scenario: A workbench with no product

- **WHEN** the workbench starts with no product
- **THEN** the joined state has no part `constructs`, and the hub refuses `constructs/start` with the reason `unknown-type`

### Requirement: An input starts a product construct

The input `constructs/start` SHALL hold the ID of a construct and an optional `running` value, which is `true` by default. The ID SHALL have the form of the ID of a subsystem. The construct list SHALL set the wanted state of that construct to `running`, SHALL keep the `running` value as the time state at the start, and SHALL keep the sequence number of the input in the workbench record as the start number. A start of a construct that is wanted to run SHALL keep the same part.

#### Scenario: A new construct

- **WHEN** an input subsystem sends `constructs/start` with the construct `play`
- **THEN** the part `constructs` holds `play` with the wanted state `running`, the status `pending`, and the time state `running` at the start

#### Scenario: A start in a pause

- **WHEN** an input subsystem sends `constructs/start` with the construct `check` and `running` set to `false`
- **THEN** the part holds `check` with the time state `paused` at the start

#### Scenario: A second start

- **WHEN** the construct `play` is wanted to run, and an input subsystem sends `constructs/start` with `play`
- **THEN** the part `constructs` is the same object as before

#### Scenario: The start number

- **WHEN** the workbench record holds 6 inputs, and an input subsystem sends `constructs/start` with the construct `play`
- **THEN** the part holds `play` with the start number `7`

#### Scenario: A stop and a start

- **WHEN** `play` was started by the input 7, and an input subsystem sends `constructs/stop` with `play` as the input 9 and `constructs/start` with `play` as the input 10
- **THEN** the part holds `play` with the wanted state `running`, the status `pending`, and the start number `10`

#### Scenario: An ID that is not correct

- **WHEN** an input subsystem sends `constructs/start` with the construct `Play 1`
- **THEN** the hub refuses the input with the reason `invalid` and a problem at the path `payload.construct`

### Requirement: An input stops a product construct

The input `constructs/stop` SHALL hold the ID of a construct in the list. The construct list SHALL set the wanted state of that construct to `stopped`. The construct SHALL stay in the list. A stop of a construct that is not in the list SHALL be refused.

#### Scenario: A stop

- **WHEN** the construct `play` is wanted to run, and an input subsystem sends `constructs/stop` with `play`
- **THEN** the part holds `play` with the wanted state `stopped`

#### Scenario: A construct that is not in the list

- **WHEN** an input subsystem sends `constructs/stop` with the construct `other`, and the list has no `other`
- **THEN** the hub refuses the input with the reason `invalid`

### Requirement: An input asks the construct manager to pass an input

The input `constructs/send` SHALL hold the ID of a construct and one input with a type and a payload. The construct list SHALL accept it only when the construct is wanted to run and its status is `running`. An accepted `constructs/send` SHALL keep the same part. The hub SHALL keep it in the record of the workbench.

#### Scenario: A send to a running construct

- **WHEN** the construct `play` has the status `running`, and an input subsystem sends `constructs/send` with `play` and the input `time/set-running` with `false`
- **THEN** the hub accepts the input, and the part `constructs` is the same object as before

#### Scenario: A send to a construct that does not run

- **WHEN** the construct `play` has the status `pending`, and an input subsystem sends `constructs/send` with `play`
- **THEN** the hub refuses the input with the reason `invalid` and a problem at the path `payload.construct`

#### Scenario: An input with no type

- **WHEN** an input subsystem sends `constructs/send` with `play` and an input that has no string `type`
- **THEN** the hub refuses the input with the reason `invalid` and a problem at the path `payload.input.type`

### Requirement: Only the construct manager reports a status

The input `constructs/report` SHALL hold the ID of a construct in the list and its status: `running`, `stopped`, or `failed`. It SHALL be able to hold the address of the link of the construct, the time state (`running` or `paused`), a message, and the result of the last pass of an input. The construct list SHALL accept it only from the source `construct-manager`. A report that is equal to the reported status SHALL keep the same part.

#### Scenario: A report of the construct manager

- **WHEN** the construct manager sends `constructs/report` with `play`, the status `running`, and the link `ws://127.0.0.1:41377/link`
- **THEN** the part holds `play` with the status `running` and that link

#### Scenario: A report from a different subsystem

- **WHEN** a client of the link sends `constructs/report` with `play` and the status `running`
- **THEN** the hub refuses the input with the reason `invalid`, and the part does not change

#### Scenario: The same report two times

- **WHEN** the construct manager sends a report that is equal to the status in the part
- **THEN** the part `constructs` is the same object as before

### Requirement: The construct list follows the record

The construct list SHALL depend only on the inputs of the record. A rewind of the workbench SHALL return the wanted states and the reported statuses to the state after the target. The part SHALL hold JSON data only.

#### Scenario: A rewind before a start

- **WHEN** an input sends `constructs/start` with `play`, and then `hub/rewind` returns the workbench to the state before that input
- **THEN** the part `constructs` holds no construct

#### Scenario: A replay

- **WHEN** a new hub replays a record of the workbench with starts, reports, and stops
- **THEN** the part `constructs` of the new hub is equal to the part of the first hub

### Requirement: A report keeps the start of the entry

A report of the construct manager SHALL keep the wanted state, the time state at the start, and the start number of the entry.

#### Scenario: A report keeps the start number

- **WHEN** `play` has the start number `7` and the time state `paused` at the start, and the construct manager sends `constructs/report` with `play` and the status `running`
- **THEN** the part holds `play` with the wanted state `running`, the time state `paused` at the start, and the start number `7`

### Requirement: An input asks the construct manager to step a construct back

The input `constructs/rewind` SHALL hold the ID of a construct and a count of ticks, an integer of 1 or more. The construct list SHALL accept it only when the construct is wanted to run and its status is `running`. An accepted `constructs/rewind` SHALL keep the same part. The hub SHALL keep it in the record of the workbench.

#### Scenario: A rewind of one tick

- **WHEN** the construct `play` has the status `running`, and an input subsystem sends `constructs/rewind` with `play` and `ticks` set to `1`
- **THEN** the hub accepts the input, and the part `constructs` is the same object as before

#### Scenario: A count that is not correct

- **WHEN** an input subsystem sends `constructs/rewind` with `play` and `ticks` set to `0`, `1.5`, or `"one"`
- **THEN** the hub refuses the input with the reason `invalid` and a problem at the path `payload.ticks`

#### Scenario: A construct that does not run

- **WHEN** the construct `play` has the status `pending`, and an input subsystem sends `constructs/rewind` with `play`
- **THEN** the hub refuses the input with the reason `invalid` and a problem at the path `payload.construct`

### Requirement: A report of an earlier start changes nothing

The input `constructs/report` SHALL be able to hold the start number of the start that the report is about. When the start number of the report is not the start number of the entry, the construct list SHALL keep the same part. A report with no start number SHALL apply to the entry as before.

#### Scenario: A report of a start that a stop and a start replaced

- **WHEN** `play` has the start number `7`, an input subsystem sends `constructs/stop` and then `constructs/start` with `play` so that `play` has the start number `9`, and the construct manager sends `constructs/report` with `play`, the status `failed`, and the start number `7`
- **THEN** the part is the same object as before, and `play` has the status `pending` and the start number `9`

#### Scenario: A report of the current start

- **WHEN** `play` has the start number `9`, and the construct manager sends `constructs/report` with `play`, the status `failed`, and the start number `9`
- **THEN** the part holds `play` with the status `failed`
