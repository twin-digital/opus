# Spec Delta

## ADDED Requirements

### Requirement: A tick sets each color

The package SHALL give the color behavior: a native behavior for the component type `Color`, which the update subsystem runs. At each tick, it SHALL set the `color` field of each `Color` component to the color at the position `ticks` modulo 4 of the list `#1d4ed8`, `#b91c1c`, `#15803d`, `#a16207`. The first color of the list SHALL be the color of the model folder. The behavior SHALL be a pure function of the fields and the tick.

#### Scenario: One tick

- **WHEN** a hub has the time subsystem first and the update subsystem of the sample store with the behaviors of the sample product second, and it gets one tick
- **THEN** the color of the sample entity is `#b91c1c`

#### Scenario: Four ticks

- **WHEN** the hub gets four ticks from tick 0
- **THEN** the color of the sample entity is `#1d4ed8`

#### Scenario: A color that a person set

- **WHEN** an input `store/set-field` sets the color to `#000000` at tick 1, and the hub gets one tick
- **THEN** the color is `#15803d`

#### Scenario: A rewind

- **WHEN** a hub gets three ticks, and then `hub/rewind` returns to the state after the first tick
- **THEN** the color is `#b91c1c`, and the count is `1`

## MODIFIED Requirements

### Requirement: The root entry exports the behaviors of the product

The root entry of the package SHALL export the list `behaviors`, which holds the count behavior and then the color behavior. It SHALL be the one export that a product construct needs from the code of the product. The list SHALL import nothing of the workbench.

#### Scenario: The construct manager loads the behaviors

- **WHEN** the workbench names `@thrashplay/wishem-sample-product` as the product code, and a product construct gets three ticks
- **THEN** the count of the sample entity is three more than the count at the start, and the color is `#a16207`

#### Scenario: The list

- **WHEN** a test reads `behaviors` of the root entry
- **THEN** the list holds two behaviors: the count behavior for the component type `Counter`, and then the color behavior for the component type `Color`
