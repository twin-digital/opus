# Spec Delta

## ADDED Requirements

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
