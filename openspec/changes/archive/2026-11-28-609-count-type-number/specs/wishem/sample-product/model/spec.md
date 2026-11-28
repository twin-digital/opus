# Spec Delta

## MODIFIED Requirements

### Requirement: The sample product has a model folder

The package `@thrashplay/wishem-sample-product` SHALL hold a model folder `model/`. The model SHALL hold the component type `Color` with one string field `color`, the component type `Counter` with one number field `count`, and one entity with a `Color` component and a `Counter` component. The first values SHALL be the text `#1d4ed8` and the number `0`. The model SHALL be correct and SHALL have no warning.

#### Scenario: Validate the model

- **WHEN** a test validates the two definition files and `state.json` of `model/`
- **THEN** the model is correct, has no warning, has the labels `Color` and `Counter`, and has one entity with the color `#1d4ed8` and the count `0` as a number

#### Scenario: Start the sample product alone

- **WHEN** a person runs `wishem start nodejs/wishem/sample-product/model`
- **THEN** the command prints `wishem: 2 component types, 1 entity`

#### Scenario: A count that is text

- **WHEN** a person changes the count in `state.json` of a copy of the model folder to the text `"8"`
- **THEN** the model is not correct, and the problem names the field `count` of `Counter` and the type `number`

### Requirement: A tick adds 1 to each count

The package SHALL give a count rule that wraps a store. The result SHALL be a model subsystem with the ID of the store. It SHALL apply each input type of the store as the store does, and also `time/advance`. For each `time/advance`, it SHALL add 1 to each `count` value that is a number. It SHALL NOT change a value that is not a number. It SHALL NOT refuse a tick.

#### Scenario: Three ticks

- **WHEN** a hub has the time subsystem first and the sample store with the count rule second, and it gets three ticks
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

- **WHEN** the wrapped store gets `store/set-field` that sets the color to `#15803d`
- **THEN** the part holds `#15803d`, as with the store alone
