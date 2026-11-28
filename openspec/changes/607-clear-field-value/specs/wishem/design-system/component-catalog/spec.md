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
- **THEN** it shows, in light mode and in dark mode, the specimens "Entity list", "Entity list, selected", "Entity list, empty", "Field row, string", "Field row, number", "Field row, boolean", "Field row, reference", "Field row, no value", "Field row, saving", "Field row, not saved", "Field row, not cleared", "Field row, disabled", "Inspector, nothing selected", "Inspector, an entity", and "Product panel"

### Requirement: The field row

The field row SHALL show the label of the field in UI text, the type of the field as a mono label in `fg-muted`, the control for the type, and a plain button with the label `Clear` after the control. The text field and the select SHALL use `surface`, `fg`, `control-border`, a focus ring in `accent`, and, for the text field, a caret in `maker`. The check box SHALL have the label of the field as its accessible name. The text `no value` SHALL be a mono label in `fg-muted`.

#### Scenario: The row of a number field

- **WHEN** the field row gets the field `count` of the type `number` with the value `0`
- **THEN** it shows the label `count`, the mono label `NUMBER`, a text field with the accessible name `count` that holds `0`, and a button with the accessible name `Clear count`

#### Scenario: A row with no input port

- **WHEN** the field row gets no change function
- **THEN** its control is disabled, its button `Clear` is disabled, and the row shows the value

#### Scenario: A row with no value

- **WHEN** the field row gets no value
- **THEN** its button `Clear` is disabled, and the row shows `no value`

#### Scenario: Not cleared

- **WHEN** the clear function gives a rejection with the reason text `The workbench does not run. Start it, and try again.`
- **THEN** the line below the control shows `The value is not cleared. The workbench does not run. Start it, and try again.` in `danger-text`, in an element with the role `alert`, and the control holds the value of the field

#### Scenario: A narrow row

- **WHEN** the field row is shown in a viewport 390 pixels wide
- **THEN** the button `Clear` is on the line of the control, and the row needs no horizontal scroll

## ADDED Requirements

### Requirement: A button can have an accessible name

A button SHALL be able to have an accessible name that is different from its label. That name SHALL start with the label. The look of the button SHALL NOT change.

#### Scenario: An accessible name

- **WHEN** a button has the label `Clear` and the accessible name `Clear count`
- **THEN** it shows `Clear`, and its accessible name is `Clear count`
