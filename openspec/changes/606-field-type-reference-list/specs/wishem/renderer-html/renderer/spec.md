# Spec Delta

## MODIFIED Requirements

### Requirement: A held entity is drawn in the place of its holder

An entity SHALL be held when a `reference` field or a `reference-list` field of a component of a different entity names it, and the component type of that component has a view. The renderer SHALL give the picture of a held entity to the view of its holder, and SHALL NOT draw the held entity at the top level. An entity that two holders name SHALL be drawn in the place of each holder.

#### Scenario: Two holders

- **WHEN** the entities `a` and `b` each have a component with a view whose reference field names `task`
- **THEN** the renderer draws `task` in the picture of `a` and in the picture of `b`, and each picture of `task` is in an element marked with the ID of `task`

#### Scenario: A reference field of a component type with no view

- **WHEN** the only reference that names `task` is in a component whose component type has no view
- **THEN** the renderer draws `task` at the top level

#### Scenario: The reference changes

- **WHEN** the renderer draws `task` in the picture of `list`, and an input sets the reference field of `list` to the entity `other`
- **THEN** the renderer draws `other` in the picture of `list`, and draws `task` at the top level

#### Scenario: The entities of a list are held

- **WHEN** a `reference-list` field of a component with a view of `deck` holds the IDs of `goat` and `owl`
- **THEN** the renderer draws `goat` and `owl` in the picture of `deck`, and does not draw them at the top level

#### Scenario: An entity leaves the list

- **WHEN** the renderer draws `goat` in the picture of `deck`, and the store applies `remove-reference` of `goat` from that list
- **THEN** the renderer draws `goat` at the top level, and not in the picture of `deck`
