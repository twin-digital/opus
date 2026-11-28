# wishem/workbench/product-panel Specification

## Purpose

Defines the product panel: the tool of the workbench page that lists the entities of the mounted product and changes the field values of one entity, through inputs to the workbench construct.

## Requirements

### Requirement: The page shows the product panel when a product is mounted

When the joined state of the link has the part `product`, the page SHALL show the product panel in the space below the pictures of the views. When the joined state has no part `product`, the page SHALL NOT show the product panel. The product panel SHALL read the part `product` only, and SHALL NOT read the parts `store` or `constructs`.

#### Scenario: A workbench with the sample product

- **WHEN** the workbench runs with the sample product mounted, and a web browser opens the page
- **THEN** the page shows the app bar, and below it the product panel with one entity in the list

#### Scenario: A workbench with no product

- **WHEN** the workbench runs with no product, and a web browser opens the page
- **THEN** the page shows the app bar and the zero state, and no product panel

### Requirement: The list shows each entity of the product

The product panel SHALL show one item for each entity of the part `product`, in the order of the entities. Each item SHALL show the name of the entity and the short form of its ID. The name SHALL be the labels of the component types of its components, in the order of the definitions, with a comma and a space between them. An entity with no component SHALL have the name `No components`. The short form SHALL be the first 10 characters of the ID.

#### Scenario: The sample entity

- **WHEN** the product panel shows the sample product
- **THEN** the list has one item with the name `Counter, Color` and the short ID `e_99969ed3`

#### Scenario: A product with no entity

- **WHEN** the part `product` has no entity
- **THEN** the list shows the zero state with the text `No entities yet.`

### Requirement: The list follows the part product

After each input that changes the part `product`, the product panel SHALL show the new entities and the new values. The person SHALL NOT need to reload the page. The selection SHALL stay on the same entity ID while that entity exists. When the selected entity is removed, the panel SHALL clear the selection.

#### Scenario: A hand edit adds an entity

- **WHEN** the panel shows the sample product, and a person adds a second entity to the `state.json` of the product folder
- **THEN** the list shows two items, and the selection does not change

#### Scenario: A hand edit removes the selected entity

- **WHEN** the designer selected an entity, and a hand edit removes that entity
- **THEN** the list does not show it, and the inspector shows the text `Select an entity to change it.`

### Requirement: The inspector shows the selected entity

When no entity is selected, the inspector SHALL show the zero state with the text `Select an entity to change it.`. When an entity is selected, the inspector SHALL show its name and its full ID, and one group for each of its components, in the order of the definitions. Each group SHALL show the label of the component type and one row for each field of the component type, in the order of the fields, also for a field with no value.

#### Scenario: The sample entity is selected

- **WHEN** the designer selects the item `Counter, Color`
- **THEN** the inspector shows the group `Color` with the row `color` and the value `#1d4ed8`, and the group `Counter` with the row `count` and the value `0`

#### Scenario: A field with no value

- **WHEN** the component of the selected entity has no value for a field of its component type
- **THEN** the row of that field shows an empty control and the text `no value`

### Requirement: Each field type has its control

A row SHALL show a control for the type of its field. A `string` field SHALL have a text field. A `number` field SHALL have a text field that shows the number in decimal form. A `boolean` field SHALL have a check box. A `reference` field SHALL have a select with one option for each entity of the part `product`, which gives the name and the short ID of the entity.

#### Scenario: A reference field

- **WHEN** the selected entity has a `reference` field, and the product has two entities
- **THEN** the row of the field shows a select with two options, and the option of the entity that the field names is selected

### Requirement: A commit sends one set-field input to the product

A commit in a row SHALL send one `product/set-field` input through the input port of the page, with the entity, the component type, the field, and the new value. In a text field, Enter or a move of the focus out of the field SHALL commit. In a check box and in a select, a change SHALL commit. A commit of a value that is equal to the current value SHALL send no input. The hub SHALL record the input with the source of the input subsystem of the page.

#### Scenario: A new count

- **WHEN** the designer selects the sample entity, types `7` in the row `count`, and presses Enter
- **THEN** the hub applies one `product/set-field` input with the value `7` as a number, its source is `page-<hex>-input`, and the `state.json` of the product folder holds the count `7`

#### Scenario: A new color while a product construct runs

- **WHEN** a product construct `play` runs, and the designer commits `#b91c1c` in the row `color`
- **THEN** the `state.json` of the product folder holds `#b91c1c`, and the part `store` of `play` holds `#b91c1c`

#### Scenario: The same value

- **WHEN** the designer moves the focus out of the row `count` with no change of its text
- **THEN** the page sends no input

### Requirement: A number field sends only a number

A commit in the text field of a `number` field SHALL send the value as a JSON number. When the text does not give a finite number, the row SHALL send no input, and SHALL show the state "not saved" with the reason `Type a number.`.

#### Scenario: Text that is not a number

- **WHEN** the designer types `ten` in the row `count` and presses Enter
- **THEN** the page sends no input, the row shows `The value is not saved. Type a number.`, and the text field holds `ten`

### Requirement: A row shows the state of its change

While a change waits for its outcome, the control of the row SHALL be read-only or disabled and SHALL have `aria-busy="true"`, and the row SHALL show the mono label `Saving`. After a rejection, the row SHALL keep the value of the designer and SHALL show `The value is not saved.` and the reason, in an element with the role `alert`. After an accepted change, the row SHALL show the value of the part `product`.

#### Scenario: The workbench does not run

- **WHEN** the process of the workbench stopped, and the designer commits a new count
- **THEN** the row shows `The value is not saved. The workbench does not run. Start it, and try again.`, and the text field keeps the new count

### Requirement: Escape restores the value

Escape in a text field SHALL restore the value of the part `product`, SHALL clear the state "not saved", and SHALL send no input. The focus SHALL stay in the text field.

#### Scenario: Escape

- **WHEN** the designer types `99` in the row `count` and presses Escape
- **THEN** the row shows the count of the part `product`, and the page sends no input

### Requirement: A change of the value while the designer types

While a text field holds text that the designer did not commit, a change of the same value in the part `product` SHALL NOT replace that text. After the commit or Escape, the row SHALL show the value of the part `product`.

#### Scenario: A hand edit while the designer types

- **WHEN** the designer types `12` in the row `count` and does not commit, and a hand edit sets the count to `5`
- **THEN** the text field still holds `12`, and after Escape it shows `5`

### Requirement: A rewind of the workbench is an undo of a change in the panel

A change that the product panel sends SHALL be an input of the record of the workbench construct. A rewind of the workbench construct to the sequence number before that input SHALL restore the value in the panel and in the `state.json` of the product folder.

#### Scenario: Undo of a count

- **WHEN** the designer commits the count `7`, and a client of the link sends `hub/rewind` with the sequence number before that input
- **THEN** the row `count` shows `0`, and the `state.json` of the product folder holds the count `0`

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
