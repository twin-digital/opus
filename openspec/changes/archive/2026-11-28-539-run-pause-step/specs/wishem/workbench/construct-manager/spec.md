# Spec Delta

## ADDED Requirements

### Requirement: The part time of a product construct holds its step length

The part `time` of a product construct SHALL hold the step length of its clock as `stepMs`. The default step length SHALL be 50 milliseconds.

#### Scenario: A product construct of the workbench

- **WHEN** an input subsystem starts `play`, and a client of the link of `play` reads the joined state
- **THEN** the part `time` has `stepMs` 50

#### Scenario: A different step length

- **WHEN** a program starts a product construct with the step length 500
- **THEN** the part `time` has `stepMs` 500, and the clock sends ticks of 500 milliseconds

### Requirement: The construct manager steps a product construct back

After the workbench hub applies `constructs/rewind`, the construct manager SHALL send `hub/rewind` to the product construct, with the source `construct-manager` and the target before the tick that is `ticks` ticks back in the history of the construct. A history of fewer ticks SHALL give the target before its first tick.

#### Scenario: One tick back

- **WHEN** `play` is paused after 12 ticks, and an input subsystem sends `constructs/rewind` with `play` and `ticks` set to `1`
- **THEN** the part `time` of `play` has 11 ticks, and the part `constructs` holds the result `ok` under the sequence number of the `constructs/rewind`

#### Scenario: More ticks than the history

- **WHEN** `play` is paused after 3 ticks, and an input subsystem sends `constructs/rewind` with `play` and `ticks` set to `10`
- **THEN** the part `time` of `play` has 0 ticks

#### Scenario: Two step backs

- **WHEN** `play` is paused after 12 ticks, and an input subsystem sends `constructs/rewind` with `ticks` set to `1` two times
- **THEN** the part `time` of `play` has 10 ticks

#### Scenario: A step back after a step

- **WHEN** `play` is paused after 12 ticks, an input subsystem sends one step and then `constructs/rewind` with `ticks` set to `1`
- **THEN** the part `time` of `play` has 12 ticks

#### Scenario: No tick

- **WHEN** `play` started paused and has 0 ticks, and an input subsystem sends `constructs/rewind` with `play`
- **THEN** the joined state of `play` does not change, and the part `constructs` holds a result with `"ok":false` and the reason `invalid`

### Requirement: The construct manager reports the result of a step back

The construct manager SHALL report the result of the `hub/rewind` of a step back as the last pass, with the sequence number of the `constructs/rewind` in the workbench record. A rewind or a replay of the workbench SHALL NOT send a step back again.

#### Scenario: A rewind of the workbench past a step back

- **WHEN** an input subsystem sent `constructs/rewind` to `play`, and `hub/rewind` of the workbench returns to the state before it
- **THEN** the construct manager sends no input to `play`

### Requirement: A step back keeps the time state and the authored changes

A step back SHALL keep the `running` value that the product construct had before it. It SHALL keep each change of the product model that the construct manager sent after the target. The construct manager SHALL send the rewind and the inputs that keep these values with no tick of the clock between them.

#### Scenario: A step back during a pause

- **WHEN** `play` ran, was paused, and an input subsystem sends `constructs/rewind` with `ticks` set to `1`
- **THEN** the part `time` of `play` has `running` set to `false`, and the clock sends no tick for 1 second

#### Scenario: A change of the product before a step back

- **WHEN** `play` is paused, an input subsystem sends `product/set-field` that sets the color to `#b91c1c`, and then `constructs/rewind` with `ticks` set to `1`
- **THEN** the store of `play` holds `#b91c1c`, and its count is the count before the last tick

#### Scenario: A step back while the construct runs

- **WHEN** `play` runs, and an input subsystem sends `constructs/rewind` with `ticks` set to `1`
- **THEN** the part `time` of `play` has `running` set to `true` after the rewind
