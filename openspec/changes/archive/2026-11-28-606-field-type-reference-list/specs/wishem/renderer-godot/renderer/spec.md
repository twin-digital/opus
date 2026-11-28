# Spec Delta

## ADDED Requirements

### Requirement: A Godot view gets a list of references as a list of IDs

The prop of a `reference-list` field SHALL be an `Array` of the entity IDs of its value, in the order of the value. The Godot renderer SHALL hold no entity: it SHALL draw each entity that a list names by the rules of an entity that nothing names.

#### Scenario: A deck of two cards

- **WHEN** the `reference-list` field `Cards` of the component of a view holds the IDs of `goat` and `owl`
- **THEN** the view gets the prop `cards` with an `Array` of the two IDs, the ID of `goat` first

#### Scenario: An empty list

- **WHEN** the field `Cards` holds `[]`
- **THEN** the view gets the prop `cards` with an empty `Array`
