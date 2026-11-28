# Spec Delta

## ADDED Requirements

### Requirement: The prop of a reference-list field is a list of pictures

The prop of a `reference-list` field SHALL be a list with one item for each ID of the value, in the order of the value. Each item SHALL be the picture of that entity, by the rule of the prop of a `reference` field. An item whose entity is already on the path from the top level SHALL draw nothing, and SHALL give the warning of a cycle of references. The prop SHALL be an empty list for an empty value, and SHALL have no value when the component omits the field.

#### Scenario: A deck of two cards

- **WHEN** the `reference-list` field `cards` of the entity `deck` holds the IDs of `goat` and `owl`, and the component types of the three entities have views
- **THEN** the view of `deck` gets in the prop `cards` a list of two pictures, the picture of `goat` first, and each picture is in an element marked with the ID of its entity, inside the element marked with the ID of `deck`

#### Scenario: A new order

- **WHEN** an input sets the field `cards` to the IDs of `owl` and `goat`
- **THEN** the view of `deck` gets the picture of `owl` first

#### Scenario: An empty list

- **WHEN** the field `cards` holds `[]`
- **THEN** the view of `deck` gets in the prop `cards` an empty list

#### Scenario: A list that names its holder

- **WHEN** the field `cards` of `deck` holds the IDs of `goat` and `deck`
- **THEN** the view of `deck` gets a list of two items, the second item draws nothing, and the browser console has one warning that names `deck`, the field, and `deck`
