# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: A report keeps the start of the entry

A report of the construct manager SHALL keep the wanted state, the time state at the start, and the start number of the entry.

#### Scenario: A report keeps the start number

- **WHEN** `play` has the start number `7` and the time state `paused` at the start, and the construct manager sends `constructs/report` with `play` and the status `running`
- **THEN** the part holds `play` with the wanted state `running`, the time state `paused` at the start, and the start number `7`
