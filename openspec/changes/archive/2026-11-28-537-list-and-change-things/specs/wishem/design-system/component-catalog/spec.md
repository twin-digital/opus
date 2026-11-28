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
- **THEN** it shows, in light mode and in dark mode, the specimens "Entity list", "Entity list, selected", "Entity list, empty", "Field row, string", "Field row, number", "Field row, boolean", "Field row, reference", "Field row, no value", "Field row, saving", "Field row, not saved", "Field row, disabled", "Inspector, nothing selected", "Inspector, an entity", and "Product panel"

## ADDED Requirements

### Requirement: The entity list

The entity list SHALL show one button for each entity that it gets, with the name in UI text in `fg` and the short ID as a mono label in `fg-muted`. The selected item SHALL have `aria-current="true"`, a bar in `accent` at its start edge, and its name in `accent-text`. A list with no entity SHALL show the zero state with the label `Entities` and the text `No entities yet.`.

#### Scenario: The selected item

- **WHEN** the entity list shows two entities and the second one is selected
- **THEN** only the second button has `aria-current="true"`, and its name has the color of `accent-text`

#### Scenario: Selection with the keyboard

- **WHEN** the focus is on an item, and the person presses Enter or Space
- **THEN** the list calls its select function one time with the ID of that entity, and the focus stays on the item

### Requirement: The field row

The field row SHALL show the label of the field in UI text, the type of the field as a mono label in `fg-muted`, and the control for the type. The text field and the select SHALL use `surface`, `fg`, `control-border`, a focus ring in `accent`, and, for the text field, a caret in `maker`. The check box SHALL have the label of the field as its accessible name. The text `no value` SHALL be a mono label in `fg-muted`.

#### Scenario: The row of a number field

- **WHEN** the field row gets the field `count` of the type `number` with the value `0`
- **THEN** it shows the label `count`, the mono label `NUMBER`, and a text field with the accessible name `count` that holds `0`

#### Scenario: A row with no input port

- **WHEN** the field row gets no change function
- **THEN** its control is disabled, and the row shows the value

### Requirement: The field row shows the state of a change

While a change of a field row waits for its outcome, the control SHALL be read-only or disabled, SHALL have `aria-busy="true"`, and the mono label `Saving` SHALL show beside it in `fg-muted`. After a rejection, a line below the control SHALL show `The value is not saved.` and the reason in `danger-text`, in an element with the role `alert`. The style guide SHALL show each state through the first state that the row gets.

#### Scenario: Not saved

- **WHEN** the change function gives a rejection with the reason text `The workbench does not run. Start it, and try again.`
- **THEN** the line below the control shows `The value is not saved. The workbench does not run. Start it, and try again.`, and the control holds the value of the designer

#### Scenario: The row is removed while it saves

- **WHEN** the field row is removed from the page while a change waits, and then the outcome arrives
- **THEN** no error occurs

### Requirement: The inspector

The inspector SHALL show the name of the entity as a heading, the full ID as a mono label in `fg-muted`, and one group for each component, with the label of the component type as the legend of the group and one field row for each field. With no entity, it SHALL show the zero state with the label `Inspector` and the text `Select an entity to change it.`.

#### Scenario: The groups of the sample entity

- **WHEN** the inspector gets the sample entity
- **THEN** it shows the heading `Color, Counter`, the groups `Color` and `Counter` in this order, and one field row in each group

### Requirement: The product panel

The product panel SHALL show the entity list and the inspector on `surface`, with a line in `line` between them. At a viewport width of 768 pixels or more, the list SHALL be a column of 288 pixels at the start, and the inspector SHALL take the remaining width. At a smaller width, the list SHALL be above the inspector, and each field row SHALL show its label above its control. The list SHALL be in a `nav` element with the name `Entities`.

#### Scenario: A narrow viewport

- **WHEN** the product panel is shown in a viewport 390 pixels wide
- **THEN** the list is above the inspector, and no part of the panel needs a horizontal scroll

#### Scenario: A wide viewport

- **WHEN** the product panel is shown in a viewport 1280 pixels wide
- **THEN** the list is 288 pixels wide at the left, and the inspector is at its right
