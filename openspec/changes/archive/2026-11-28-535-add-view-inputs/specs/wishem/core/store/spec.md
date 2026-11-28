# Spec Delta

## MODIFIED Requirements

### Requirement: An input removes an entity

The input `remove-entity` SHALL hold the ID of one entity. The store SHALL remove that entity. The store SHALL refuse the input when no entity has that ID, and when a reference field of a different entity names that entity.

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

### Requirement: An input sets a field value

The input `set-field` SHALL hold the ID of an entity, the ID of a component type, the ID of a field, and a value. The store SHALL set that value in the component of the entity. When the entity has no component of that type, the store SHALL add the component with that one value. The store SHALL refuse the input when the entity does not exist, when the component type is not defined, when the field is not a field of the component type, or when the value does not agree with the type of the field.

#### Scenario: A new title

- **WHEN** the store gets `set-field` for the `title` field of the `AppBar` component of the app bar with the value `Wishem workbench`
- **THEN** the part holds that value, and each other entity is unchanged

#### Scenario: A component that the entity does not have

- **WHEN** an entity has no `AppBar` component, and the store gets `set-field` for the `title` field of `AppBar` on that entity
- **THEN** the entity has an `AppBar` component with that one value

#### Scenario: A field of a different component type

- **WHEN** the store gets `set-field` with a field ID that is not a field of the named component type
- **THEN** the store refuses the input with a problem that names the field

#### Scenario: A value of an incorrect type

- **WHEN** the store gets `set-field` for a string field with the value `7` as a number
- **THEN** the store refuses the input

#### Scenario: A number and a boolean

- **WHEN** the store gets `set-field` with the value `3` for a number field, and then with `true` for a boolean field
- **THEN** the part holds `3` and `true`

#### Scenario: A reference to an entity that does not exist

- **WHEN** the store gets `set-field` for a reference field with an entity ID that no entity has
- **THEN** the store refuses the input with a problem that names the ID, and the part is the same object as before

## ADDED Requirements

### Requirement: A value that does not change keeps the part

When `set-field` holds the value that the field holds now, the store SHALL accept the input and SHALL give the same part object. Two values SHALL be the same when they have the same JSON type and the same JSON value.

#### Scenario: The same value

- **WHEN** the store gets `set-field` with the value that the field holds, for a field of each of the four types
- **THEN** the hub accepts the input, and the part is the same object as before

#### Scenario: A number and its text

- **WHEN** a number field holds `3`, and the store gets `set-field` with the value `"3"`
- **THEN** the store refuses the input, and the part is the same object as before
