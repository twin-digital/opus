# Spec Delta

## ADDED Requirements

### Requirement: A PixiJS view gets a list of references as a list of IDs

The prop of a `reference-list` field SHALL be the list of the entity IDs of its value, in the order of the value. The PixiJS renderer SHALL hold no entity: it SHALL draw each entity that a list names by the rules of an entity that nothing names.

#### Scenario: A deck of two cards

- **WHEN** the `reference-list` field `Cards` of the component of a view holds the IDs of `goat` and `owl`
- **THEN** the view gets the prop `cards` with the list of the two IDs, the ID of `goat` first

#### Scenario: The entities of the list have views

- **WHEN** the components of `goat` and `owl` have views, and a list of `deck` names them
- **THEN** the renderer draws `goat` and `owl` at the top level
