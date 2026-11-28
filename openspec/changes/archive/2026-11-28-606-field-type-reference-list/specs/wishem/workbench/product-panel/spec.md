# Spec Delta

## MODIFIED Requirements

### Requirement: Each field type has its control

A row SHALL show a control for the type of its field. A `string` field SHALL have a text field. A `number` field SHALL have a text field that shows the number in decimal form. A `boolean` field SHALL have a check box. A `reference` field SHALL have a select with one option for each entity of the part `product`, which gives the name and the short ID of the entity. A `reference-list` field SHALL have the list control of the requirement "A list of references has a list control".

#### Scenario: A reference field

- **WHEN** the selected entity has a `reference` field, and the product has two entities
- **THEN** the row of the field shows a select with two options, and the option of the entity that the field names is selected

#### Scenario: A reference-list field

- **WHEN** the selected entity has a `reference-list` field that holds the IDs of `goat` and `owl`
- **THEN** the row of the field shows the list control with two items, `goat` first

## ADDED Requirements

### Requirement: A list of references has a list control

The list control SHALL show one item for each ID of the value, in the order of the value, with the name and the short ID of the entity and a button `Remove`. Below the items, it SHALL show a select of the entities of the part `product` that the list does not hold, and a button `Add`. An empty list SHALL show the text `empty list`, and an omitted field SHALL show the text `no value`.

#### Scenario: A deck of two cards in a product of four entities

- **WHEN** the selected entity `deck` has a `reference-list` field that holds the IDs of `goat` and `owl`, and the product also has the entity `wolf`
- **THEN** the row shows the items `goat` and `owl`, each with a button `Remove`, and a select whose options are `deck` and `wolf`

#### Scenario: The list holds each entity

- **WHEN** the list holds the ID of each entity of the product
- **THEN** the select and the button `Add` are disabled

### Requirement: A change of a list sends one list input to the product

The button `Add` SHALL send one `product/add-reference` input with the entity, the component type, the field, and the ID of the selected option. The button `Remove` of an item SHALL send one `product/remove-reference` input with the ID of that item. The row SHALL show the state of the change by the requirement "A row shows the state of its change". The hub SHALL record the input with the source of the input subsystem of the page.

#### Scenario: A third card

- **WHEN** the designer selects `wolf` in the select of the row `cards` and activates `Add`
- **THEN** the hub applies one `product/add-reference` input with the ID of `wolf`, its source is `page-<hex>-input`, the row shows three items with `wolf` last, and the `state.json` of the product folder holds the three IDs in that order

#### Scenario: A card is removed

- **WHEN** the designer activates `Remove` of the item `owl`
- **THEN** the hub applies one `product/remove-reference` input with the ID of `owl`, and the row shows the other items in their order

#### Scenario: A hand edit of the order

- **WHEN** the row shows `goat` and then `owl`, and a hand edit of the `state.json` of the product folder reverses the list
- **THEN** the row shows `owl` and then `goat`, and the person does not reload the page

#### Scenario: A removal of an entity in a list

- **WHEN** a client of the link sends `product/remove-entity` for `goat`, and the list of `deck` holds `goat`
- **THEN** the hub refuses the input, and the row still shows `goat`

#### Scenario: Undo of a removal from the list

- **WHEN** the designer removes `owl` from the list, and a client of the link sends `hub/rewind` with the sequence number before that input
- **THEN** the row shows `owl` again, and the `state.json` of the product folder holds the ID of `owl`
