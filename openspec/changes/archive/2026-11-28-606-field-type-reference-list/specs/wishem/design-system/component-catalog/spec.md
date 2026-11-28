# Spec Delta

## MODIFIED Requirements

### Requirement: Each component is in the style guide

Each component of the workbench SHALL be in the components section of the style guide. The style guide SHALL show each component in each of its states, and it SHALL show the real component, not a copy.

#### Scenario: The first components

- **WHEN** a person opens the components section
- **THEN** it shows the app bar with a title, and the zero state

#### Scenario: The states of the app bar

- **WHEN** a person opens the components section
- **THEN** it shows the app bar in the states "App bar", "App bar, long title", "App bar, edit", "App bar, saving", and "App bar, not saved", in light mode and in dark mode

#### Scenario: The states of the components of the product panel

- **WHEN** a person opens the components section
- **THEN** it shows, in light mode and in dark mode, the specimens "Entity list", "Entity list, selected", "Entity list, empty", "Field row, string", "Field row, number", "Field row, boolean", "Field row, reference", "Field row, reference list", "Field row, reference list, empty", "Field row, reference list, saving", "Field row, reference list, not saved", "Field row, reference list, disabled", "Field row, no value", "Field row, saving", "Field row, not saved", "Field row, disabled", "Inspector, nothing selected", "Inspector, an entity", and "Product panel"

## ADDED Requirements

### Requirement: The field row of a list of references

The list control SHALL show each item as UI text with the short ID as a mono label in `fg-muted`, and each button `Remove` and `Add` as a plain button. The select SHALL use the colors of the select of a `reference` field. The text `empty list` SHALL be a mono label in `fg-muted`. The items, the select, and the buttons SHALL be in a group whose accessible name is the label of the field.

#### Scenario: The accessible names

- **WHEN** the list control of the field `cards` shows the item `Card · e_2a3b4c5d`
- **THEN** its button has the accessible name `Remove Card · e_2a3b4c5d`, and the select has the accessible name `Add to cards`

#### Scenario: The specimen of a list

- **WHEN** a person opens the specimen "Field row, reference list"
- **THEN** it shows the label of the field, the mono label `REFERENCE-LIST`, two items with a button `Remove` each, a select, and a button `Add`

#### Scenario: A list while a change waits

- **WHEN** a change of the list control waits for its outcome
- **THEN** each button and the select are disabled, the group has `aria-busy="true"`, and the mono label `Saving` shows beside the control

#### Scenario: A row with no input port

- **WHEN** the list control gets no change function
- **THEN** each button and the select are disabled, and the row shows the items
