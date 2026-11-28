# Spec Delta

## MODIFIED Requirements

### Requirement: The color rule follows the count of ticks

The update subsystem of the construct SHALL wrap the store and SHALL run the color behavior: a native behavior for the component type `Clear color`. For each tick, the color behavior SHALL set the `Color` field to the color at the position `ticks` modulo the number of colors, in a list of four different colors. The behavior SHALL be a pure function of the fields and the tick, so that the same record gives the same colors.

#### Scenario: One tick

- **WHEN** the construct is at tick 0 and the hub applies one `time/advance`
- **THEN** the `Color` field has the second color of the list

#### Scenario: Four ticks

- **WHEN** the hub applies four `time/advance` inputs from tick 0
- **THEN** the `Color` field has the first color of the list again

#### Scenario: The same record

- **WHEN** a second construct with the same model subsystems applies the record of the first construct
- **THEN** its part `store` is equal to the part `store` of the first construct

#### Scenario: A rewind

- **WHEN** the construct applied three ticks from tick 0, and a client of the link sends `hub/rewind` with the target 1
- **THEN** the `Color` field has the second color of the list, and the part `time` has `ticks` 1

#### Scenario: The record holds only the ticks

- **WHEN** the construct applied two ticks from the clock
- **THEN** the record holds two `time/advance` inputs and no input of the store
