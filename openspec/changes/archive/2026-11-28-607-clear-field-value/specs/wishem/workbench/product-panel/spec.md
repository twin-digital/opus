# Spec Delta

## ADDED Requirements

### Requirement: A row clears the value of its field

Each row SHALL show a button with the label `Clear` and the accessible name `Clear <label of the field>`, for each of the four field types. A press SHALL send one `product/clear-field` input through the input port of the page, with the entity, the component type, and the field. The hub SHALL record the input with the source of the input subsystem of the page. After an accepted clear, the row SHALL show an empty control and the text `no value`.

#### Scenario: The count is cleared

- **WHEN** the designer selects the sample entity and presses the button `Clear count`
- **THEN** the hub applies one `product/clear-field` input for the field `count`, its source is `page-<hex>-input`, the row `count` shows an empty text field and `no value`, and the `state.json` of the product folder holds no value for `count`

#### Scenario: A reference is cleared

- **WHEN** the selected entity has a `reference` field that names a different entity, and the designer presses its button `Clear`
- **THEN** the select of the row shows `No value`, and the hub then accepts `product/remove-entity` for the entity that the field named

#### Scenario: A boolean is cleared

- **WHEN** a `boolean` field holds `false`, and the designer presses its button `Clear`
- **THEN** the check box is not checked, and the row shows `no value`

#### Scenario: A clear while a product construct runs

- **WHEN** a product construct `play` of the sample product is paused with a count of `25`, and the designer clears the row `color`
- **THEN** the part `store` of `play` holds no value for `color`, and it still holds the count `25`

### Requirement: The Clear button is disabled when it can do nothing

The button `Clear` of a row SHALL be disabled when the field has no value, while a change of the row waits for its outcome, and when the page has no input port. A disabled button SHALL keep the focus and SHALL send no input. After an accepted clear, the focus SHALL stay on the button.

#### Scenario: A field with no value

- **WHEN** the row of a field with no value is shown
- **THEN** its button `Clear` has `aria-disabled="true"`, and a press sends no input

#### Scenario: The focus after a clear

- **WHEN** the designer presses the button `Clear count` with the keyboard, and the hub accepts the input
- **THEN** the focus is on the button `Clear count`, and the button is disabled

#### Scenario: A clear while the row saves

- **WHEN** a change of the row waits for its outcome
- **THEN** its button `Clear` is disabled

### Requirement: A row shows the state of a clear

While a clear waits for its outcome, the row SHALL show the state "saving" of the requirement "A row shows the state of its change". After a rejection, the row SHALL keep the value of the part `product` and SHALL show `The value is not cleared.` and the reason, in an element with the role `alert`. A later accepted change or clear of the row SHALL remove the alert.

#### Scenario: The workbench does not run

- **WHEN** the process of the workbench stopped, and the designer presses the button `Clear count`
- **THEN** the row shows `The value is not cleared. The workbench does not run. Start it, and try again.`, and the text field still holds the count

### Requirement: A rewind of the workbench is an undo of a clear

A clear that the product panel sends SHALL be an input of the record of the workbench construct. A rewind of the workbench construct to the sequence number before that input SHALL restore the value in the panel and in the `state.json` of the product folder.

#### Scenario: Undo of a cleared count

- **WHEN** the designer clears the count `0`, and a client of the link sends `hub/rewind` with the sequence number before that input
- **THEN** the row `count` shows `0`, and the `state.json` of the product folder holds the count `0`
