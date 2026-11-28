# Spec Delta

## MODIFIED Requirements

### Requirement: An input removes an entity

The input `remove-entity` SHALL hold the ID of one entity. The store SHALL remove that entity. The store SHALL refuse the input when no entity has that ID, and when a `reference` field or a `reference-list` field of a different entity names that entity.

#### Scenario: An entity is removed

- **WHEN** the store holds two entities and gets `remove-entity` with the ID of the first one
- **THEN** the part holds only the second entity

#### Scenario: An ID that does not exist

- **WHEN** the store gets `remove-entity` with an ID that no entity has
- **THEN** the store refuses the input with a problem that names the ID

#### Scenario: An entity that a different entity refers to

- **WHEN** a reference field of the entity `list` names the entity `task`, and the store gets `remove-entity` for `task`
- **THEN** the store refuses the input with a problem that names `list`, the field, and the ID of `task`, and the part is the same object as before

#### Scenario: An entity that refers only to itself

- **WHEN** a reference field of an entity names that same entity, and the store gets `remove-entity` for it
- **THEN** the store removes the entity

#### Scenario: An entity in a list of a different entity

- **WHEN** a `reference-list` field of the entity `deck` holds the ID of `goat`, and the store gets `remove-entity` for `goat`
- **THEN** the store refuses the input with a problem that names `deck`, the field, and the ID of `goat`, and the part is the same object as before

#### Scenario: An entity after its removal from the list

- **WHEN** the store applied `remove-reference` of `goat` from the only list that names `goat`, and then gets `remove-entity` for `goat`
- **THEN** the store removes `goat`

### Requirement: A value that does not change keeps the part

When `set-field` holds the value that the field holds now, the store SHALL accept the input and SHALL give the same part object. Two values SHALL be the same when they have the same JSON type and the same JSON value. Two lists SHALL be the same when they hold the same items in the same order.

#### Scenario: The same value

- **WHEN** the store gets `set-field` with the value that the field holds, for a field of each of the five types
- **THEN** the hub accepts the input, and the part is the same object as before

#### Scenario: A number and its text

- **WHEN** a number field holds `3`, and the store gets `set-field` with the value `"3"`
- **THEN** the store refuses the input, and the part is the same object as before

#### Scenario: An equal list in a new object

- **WHEN** a `reference-list` field holds the IDs of `goat` and `owl`, and the store gets `set-field` with a new list of the IDs of `goat` and `owl`
- **THEN** the hub accepts the input, and the part is the same object as before

#### Scenario: The same IDs in a different order

- **WHEN** a `reference-list` field holds the IDs of `goat` and `owl`, and the store gets `set-field` with the IDs of `owl` and `goat`
- **THEN** the part holds the IDs of `owl` and `goat` in that order

## ADDED Requirements

### Requirement: An input adds a reference to a list

The input `add-reference` SHALL hold the ID of an entity, the ID of a component type, the ID of a `reference-list` field of that component type, and the entity ID `reference`. The store SHALL add `reference` at the end of the list. When the component or the field has no value, the store SHALL set the list with that one ID. When the list holds `reference`, the store SHALL accept the input and SHALL give the same part object.

#### Scenario: A third card

- **WHEN** the `cards` field of `deck` holds the IDs of `goat` and `owl`, and the store gets `add-reference` with the ID of `wolf`
- **THEN** the field holds the IDs of `goat`, `owl`, and `wolf` in that order, and each other entity is the same object as before

#### Scenario: A field with no value

- **WHEN** the component of `deck` omits the `cards` field, and the store gets `add-reference` with the ID of `goat`
- **THEN** the field holds the list of the one ID of `goat`

#### Scenario: An ID that the list holds

- **WHEN** the `cards` field of `deck` holds the ID of `goat`, and the store gets `add-reference` with the ID of `goat`
- **THEN** the hub accepts the input, and the part is the same object as before

### Requirement: An input removes a reference from a list

The input `remove-reference` SHALL hold the same keys as `add-reference`. The store SHALL remove `reference` from the list, and SHALL keep the order of the other items. A list with no item after the removal SHALL stay as `[]`. When the list does not hold `reference`, or the field has no value, the store SHALL accept the input and SHALL give the same part object.

#### Scenario: A card is removed

- **WHEN** the `cards` field of `deck` holds the IDs of `goat`, `owl`, and `wolf`, and the store gets `remove-reference` with the ID of `owl`
- **THEN** the field holds the IDs of `goat` and `wolf` in that order

#### Scenario: The last card is removed

- **WHEN** the `cards` field of `deck` holds only the ID of `goat`, and the store gets `remove-reference` with the ID of `goat`
- **THEN** the field holds `[]`

#### Scenario: An ID that the list does not hold

- **WHEN** the `cards` field of `deck` does not hold the ID of `wolf`, and the store gets `remove-reference` with the ID of `wolf`
- **THEN** the hub accepts the input, and the part is the same object as before

### Requirement: The store refuses a list input that it cannot apply

The store SHALL refuse `add-reference` and `remove-reference` when a key of the payload is not a string, when the entity does not exist, when the component type is not defined, when the field is not a field of the component type, or when the field does not have the type `reference-list`. The store SHALL refuse `add-reference` when `reference` is not the ID of an entity of the model. Each problem SHALL name the key of the payload or the place in the model.

#### Scenario: A field of a different type

- **WHEN** the store gets `add-reference` for the `string` field `name` of `deck`
- **THEN** the store refuses the input with a problem that names the field and the type `reference-list`, and the part is the same object as before

#### Scenario: An ID that no entity has

- **WHEN** the store gets `add-reference` with the ID `e_00000000-0000-4000-8000-000000000000`, and no entity has that ID
- **THEN** the store refuses the input with a problem that names the ID, and the part is the same object as before

#### Scenario: A payload with no reference

- **WHEN** an input subsystem sends `store/remove-reference` with a payload that has no `reference` key
- **THEN** the result of the hub is a rejection with the reason `invalid` and a problem whose path is `payload` and `reference`
