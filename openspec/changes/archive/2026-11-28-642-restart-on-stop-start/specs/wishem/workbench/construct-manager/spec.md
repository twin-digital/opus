# Spec Delta

## MODIFIED Requirements

### Requirement: The construct manager stops a construct that is not wanted

When a construct of the list is not wanted to run and has a product construct, the construct manager SHALL stop its clock and its hub, close its link, release its port, and report the status `stopped`. A new start of the same ID SHALL start a new product construct from the product model at that time, with a new record. This SHALL also be true when the workbench hub applies the stop and the new start before the construct manager handles the stop.

#### Scenario: A stop

- **WHEN** `play` runs, and an input subsystem sends `constructs/stop` with `play`
- **THEN** each client of the link of `play` gets the `stopping` event, the address of `play` accepts no connection, and the part holds `play` with the status `stopped`

#### Scenario: A stop and a start

- **WHEN** `play` ran with ticks and was stopped, and an input subsystem sends `constructs/start` with `play`
- **THEN** the store of the new `play` starts from the product model, and its record starts at the sequence number 0

#### Scenario: A stop and a start in one pass

- **WHEN** `play` runs with ticks, and the workbench hub applies `constructs/stop` with `play` and then `constructs/start` with `play` and `running` set to `false` before the construct manager handles the stop
- **THEN** each client of the old link gets the `stopping` event, the old address accepts no connection, the terminal shows the line of the stop and then a line of a start, and the part holds `play` with the status `running`, a new address, and the time state `paused`, and the new `play` has 0 ticks and a record that starts at the sequence number 0

### Requirement: The construct manager follows the list after a rewind

After each applied input of the workbench, the construct manager SHALL compare the construct list with the product constructs that run. It SHALL start each construct that is wanted to run and does not run, stop each product construct that is not wanted, and report the real status of each construct whose reported status is not true. It SHALL stop and start again each product construct whose start number differs from the start number of its entry.

#### Scenario: A rewind of the workbench before a start

- **WHEN** `play` runs, and `hub/rewind` of the workbench returns to the state before `constructs/start` of `play`
- **THEN** the construct manager stops the product construct of `play`

#### Scenario: A rewind to a status that is not true

- **WHEN** `play` was stopped, and `hub/rewind` of the workbench returns to a state in which `play` is wanted to stop and has the status `running`
- **THEN** the construct manager reports the status `stopped` for `play`

#### Scenario: A rewind to a different start

- **WHEN** `play` was started, stopped, and started again, and `hub/rewind` of the workbench returns to a state after the first start and before the stop
- **THEN** the construct manager stops the product construct of the second start and starts a new product construct of `play` from the product model, with a new address
