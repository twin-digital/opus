# Spec Delta

## ADDED Requirements

### Requirement: An input clears a field value

The input `clear-field` SHALL hold the ID of an entity, the ID of a component type, and the ID of a field. The store SHALL remove the value of that field from the component of the entity. The component SHALL stay in the entity, also when it then holds no value. Each other value SHALL stay. The store SHALL refuse the input when the entity does not exist, when the component type is not defined, or when the field is not a field of the component type.

#### Scenario: A count is cleared

- **WHEN** the sample entity has the count `0`, and the store gets `clear-field` for the field `count` of its `Counter` component
- **THEN** the `Counter` component of the entity holds no key `count`, the entity still has the `Counter` component, and its `Color` component is the same object as before

#### Scenario: The last value of a component

- **WHEN** a component holds one value, and the store gets `clear-field` for that field
- **THEN** the entity has that component with no value, and the model is correct

#### Scenario: A reference is cleared before the removal of its entity

- **WHEN** a reference field of the entity `list` names the entity `task`, the store gets `clear-field` for that field, and then `remove-entity` for `task`
- **THEN** the store accepts the two inputs, and the part holds only `list`

#### Scenario: An entity that does not exist

- **WHEN** the store gets `clear-field` with an entity ID that no entity has
- **THEN** the store refuses the input with a problem at the path `payload`, `entity` that names the ID, and the part is the same object as before

#### Scenario: A component type that is not defined

- **WHEN** the store gets `clear-field` with a component type ID that no definition has
- **THEN** the store refuses the input with a problem at the path `payload`, `componentType` that names the ID

#### Scenario: A field of a different component type

- **WHEN** the store gets `clear-field` with a field ID that is not a field of the named component type
- **THEN** the store refuses the input with a problem at the path `payload`, `field` that names the field

#### Scenario: A payload with a missing key

- **WHEN** the store gets `clear-field` with a payload that has no string `field` key
- **THEN** the store refuses the input with a problem at the path `payload`, `field`

#### Scenario: A rewind restores the value

- **WHEN** a hub with a store applies `clear-field` for the count, and then `hub/rewind` to the sequence number before that input
- **THEN** the part holds the count again, and it is equal to the part before the `clear-field`

### Requirement: A clear of a value that does not exist keeps the part

When the component of the entity has no value for the field, or the entity has no component of the type, the store SHALL accept `clear-field` and SHALL give the same part object. The entity SHALL NOT get a component of that type.

#### Scenario: A field with no value

- **WHEN** the store gets `clear-field` for a field that has no value
- **THEN** the hub accepts the input, and the part is the same object as before

#### Scenario: A component that the entity does not have

- **WHEN** an entity has no `AppBar` component, and the store gets `clear-field` for the `title` field of `AppBar` on that entity
- **THEN** the hub accepts the input, the part is the same object as before, and the entity has no `AppBar` component

#### Scenario: Two clears

- **WHEN** the store gets `clear-field` for the count two times
- **THEN** the hub accepts the two inputs, and the part after the second input is the same object as the part after the first input
