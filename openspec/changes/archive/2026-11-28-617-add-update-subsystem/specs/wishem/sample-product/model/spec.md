# Spec Delta

## MODIFIED Requirements

### Requirement: A tick adds 1 to each count

The package SHALL give the count behavior: a native behavior for the component type `Counter`, which the update subsystem runs. At each tick, it SHALL add 1 to the `count` value of each `Counter` component when the value is a number. It SHALL NOT change a value that is not a number. It SHALL NOT refuse a tick.

#### Scenario: Three ticks

- **WHEN** a hub has the time subsystem first and the update subsystem of the sample store with the count behavior second, and it gets three ticks
- **THEN** the count of the sample entity is the number `3`

#### Scenario: A count that a person set

- **WHEN** the count is `41`, and the hub gets one tick
- **THEN** the count is `42`

#### Scenario: A count that is not an integer

- **WHEN** the count is `1.5`, and the hub gets one tick
- **THEN** the count is `2.5`

#### Scenario: A count that is not a number

- **WHEN** the definition of `Counter` gives `count` the type `string`, the count is `many`, and the hub gets one tick
- **THEN** the hub accepts the tick, the count stays `many`, and the part `time` has one more tick

#### Scenario: A tick with no counter

- **WHEN** no entity has a `Counter` component, and the hub gets one tick
- **THEN** the part of the store is the same object as before

#### Scenario: An input of the store

- **WHEN** the update subsystem with the count behavior gets `store/set-field` that sets the color to `#15803d`
- **THEN** the part holds `#15803d`, as with the store alone

### Requirement: The count follows the record

The count SHALL depend only on the inputs of the record. A rewind and a replay SHALL give the same counts as the first run.

#### Scenario: A replay

- **WHEN** a hub with the time subsystem and the update subsystem with the count behavior gets five ticks, and a new hub replays its record
- **THEN** the new hub has the same count

#### Scenario: A rewind

- **WHEN** a hub gets five ticks, and then `hub/rewind` returns to the state after the second tick
- **THEN** the count is `2`

#### Scenario: The clock advances the count

- **WHEN** a clock with a step length of 100 milliseconds starts on a hub with the time subsystem and the update subsystem with the count behavior, and 500 milliseconds of real time pass
- **THEN** the count is `5`

## ADDED Requirements

### Requirement: The root entry exports the behaviors of the product

The root entry of the package SHALL export the list `behaviors`, which holds the count behavior. It SHALL be the one export that a product construct needs from the code of the product. The list SHALL import nothing of the workbench.

#### Scenario: The construct manager loads the behaviors

- **WHEN** the workbench names `@thrashplay/wishem-sample-product` as the product code, and a product construct gets three ticks
- **THEN** the count of the sample entity is three more than the count at the start

#### Scenario: The list

- **WHEN** a test reads `behaviors` of the root entry
- **THEN** the list holds one behavior, the count behavior, for the component type `Counter`

## REMOVED Requirements

### Requirement: The root entry exports the rules of the product as wrapStore

**Reason**: The update subsystem runs the behaviors of the product. The product code gives the list `behaviors`, and no rule wraps the store by itself (rule R22).

**Migration**: Use the export `behaviors` with `createUpdate` of `@thrashplay/wishem-update` in place of `wrapStore(store)`.
