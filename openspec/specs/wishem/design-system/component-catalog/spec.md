# wishem/design-system/component-catalog Specification

## Purpose

Defines the look of the Wishem workbench: the design tokens, the typography, the components with their required states, the two themes, and the style guide that shows them. A person or an agent that builds a user interface for the workbench takes its styles from this catalog.

## Requirements

### Requirement: The palette

The palette SHALL hold these colors, with the same value in each theme: `ink` `#17172A`, `wishfire` `#F2A93B`, `wishfire-deep` `#9E5B0C`, `wisp` `#7FD6C6`, `wisp-deep` `#23786B`, `moonlight` `#C2D0EA`, `moonlight-deep` `#3F5682`, `clay` `#C8B9A9`, and `mist` `#F2F2F6`.

#### Scenario: A palette color in the two themes

- **WHEN** the style guide shows the swatch of `wishfire` in light mode and in dark mode
- **THEN** the two swatches have the color `#F2A93B`

### Requirement: A component uses roles

A color token SHALL be a palette color or a role. A role SHALL give the purpose of a color. A component SHALL use roles only, and SHALL NOT use a palette color or a color value directly.

#### Scenario: The source of a component

- **WHEN** a person searches the source of the components for a hexadecimal color value or the name of a palette color
- **THEN** the search finds no match

### Requirement: The neutral roles

The neutral roles SHALL have these values, as light mode then dark mode: `ground` `#F7F7FA` / `#121222`; `surface` `#FFFFFF` / `#1B1B30`; `fg` `#1C1C2E` / `#ECECF3`; `fg-muted` `#5B5B70` / `#A3A3B8`; `line` `#DEDEE7` / `#2D2D46`; `control-border` `#85859A` / `#6B6B88`. `night` SHALL be `ink` and `on-night` SHALL be `mist` in each theme.

#### Scenario: The page background in each theme

- **WHEN** the style guide is shown in light mode, and then in dark mode
- **THEN** the page background is `#F7F7FA`, and then `#121222`

#### Scenario: A role that does not change

- **WHEN** the style guide shows the swatch of `night` in light mode and in dark mode
- **THEN** the two swatches have the color `#17172A`

### Requirement: The maker, spirit, and accent roles

`maker` SHALL be `wishfire`, `spirit` SHALL be `wisp`, and `accent` SHALL be `moonlight`, in each theme. `maker-text`, `spirit-text`, and `accent-text` SHALL be `wishfire-deep`, `wisp-deep`, and `moonlight-deep` in light mode, and `wishfire`, `wisp`, and `moonlight` in dark mode.

#### Scenario: Maker text in each theme

- **WHEN** the style guide shows the sample of `maker-text` in light mode, and then in dark mode
- **THEN** the text color is `#9E5B0C`, and then `#F2A93B`

### Requirement: Who acted decides the role

A thing that the designer did or can do SHALL use the maker roles. A thing that Wishem did or said SHALL use the spirit roles. A decoration or a highlight that comes from neither SHALL use the accent roles or the neutral roles. A status SHALL NOT use the maker roles or the spirit roles.

#### Scenario: The full stop of the app bar

- **WHEN** the app bar is shown
- **THEN** the full stop after the title has the `maker` color

### Requirement: The status roles

The status fills SHALL be `success` `#8FCB3A`, `warning` `#E8D44D`, `danger` `#E8555A`, and `info` `#7C9CF5`, in each theme. The status text roles SHALL be, as light mode then dark mode: `success-text` `#44700C` / `#8FCB3A`; `warning-text` `#735F00` / `#E8D44D`; `danger-text` `#C62828` / `#F2666A`; `info-text` `#2F52C4` / `#7C9CF5`.

#### Scenario: The status swatches

- **WHEN** the style guide shows the tokens section
- **THEN** it shows a swatch for each of the four status fills and a sample for each of the four status text roles

### Requirement: The theme follows the system

The workbench SHALL show light mode or dark mode in agreement with the color scheme of the system. The workbench SHALL have no control that changes the theme. It SHALL be possible to force one theme on a part of a page, so that the style guide and a test can show each theme.

#### Scenario: The system uses a dark color scheme

- **WHEN** the color scheme of the system is dark and a person opens a page of the workbench
- **THEN** the page is shown in dark mode

#### Scenario: The color scheme of the system changes

- **WHEN** a page is open and the color scheme of the system changes from dark to light
- **THEN** the page changes to light mode, and the person does not load the page again

### Requirement: Contrast

In each theme, each text role SHALL have a contrast ratio of 4.5 or more on `ground` and on `surface`. `ink` SHALL have a contrast ratio of 4.5 or more on each fill. `on-night` SHALL have a contrast ratio of 4.5 or more on `night`. `control-border` SHALL have a contrast ratio of 3 or more on `ground` and on `surface`.

#### Scenario: Maker text on the light ground

- **WHEN** the contrast ratio of `maker-text` on `ground` is calculated for light mode
- **THEN** the ratio is 4.5 or more

#### Scenario: A token value changes

- **WHEN** a person changes the value of a text role so that its contrast ratio on `ground` is less than 4.5
- **THEN** a test of the package fails and names the role

### Requirement: The typefaces

The workbench SHALL use three typefaces. Bricolage Grotesque SHALL be the display typeface, for headings 1 to 3 and the title of the app bar. Inter SHALL be the typeface for body text, UI text, control text, and heading 4. JetBrains Mono SHALL be the typeface for prompts, code, logs, and labels.

#### Scenario: The typography section

- **WHEN** the style guide shows the typography section
- **THEN** each heading from 1 to 3 is in Bricolage Grotesque, the body text is in Inter, and the code sample is in JetBrains Mono

### Requirement: The text sizes

The text sizes in pixels SHALL be: heading 1, 39; heading 2, 31; heading 3, 25; heading 4, 22; lead paragraph, 22; body text, 18; UI text, 16; control text, 14; small text, 13; mono label, 12. Body text is for long text that a person reads. UI text is the default text of the workbench.

#### Scenario: The default text of a page

- **WHEN** a page of the workbench shows text that has no other text style
- **THEN** the text is Inter at 16 pixels

### Requirement: Radius, shadow, and spacing

The radius scale SHALL have three steps: 4, 8, and 12 pixels. The shadow scale SHALL have two steps. Spacing SHALL use a scale with a base of 4 pixels.

#### Scenario: The scales in the style guide

- **WHEN** the style guide shows the tokens section
- **THEN** it shows a sample for each of the three radius steps and each of the two shadow steps

### Requirement: The app bar

The app bar SHALL show a title. Its surface SHALL be `night` and its text SHALL be `on-night`, in each theme. It SHALL show the title in lowercase, in the display typeface, with a full stop after it in the `maker` color. When the app bar gets a rename function, the title SHALL be a button that opens a text field for the title.

#### Scenario: A title with a capital letter

- **WHEN** the app bar gets the title `Wishem`
- **THEN** it shows `wishem.`, and the full stop has the color `#F2A93B`

#### Scenario: The app bar in light mode

- **WHEN** the app bar is shown in light mode
- **THEN** its surface is `#17172A`

#### Scenario: An app bar with no rename function

- **WHEN** the app bar gets no rename function
- **THEN** the title is a heading with no button, as in the style guide specimen "App bar"

### Requirement: The zero state

The zero state SHALL show a label and a line of text in the center of the space that it gets. The label SHALL be a mono label. The two texts SHALL use `fg-muted`.

#### Scenario: The zero state of the workbench

- **WHEN** the zero state is shown with the label `Workbench` and the text `Nothing to show yet.`
- **THEN** the two texts are in the center of the space, and the label is in uppercase in JetBrains Mono

### Requirement: The style guide

The workbench SHALL have a style guide page. The page SHALL show these sections in this order: the principles, the tokens, the typography, and the components. It SHALL show each section in light mode and in dark mode. It SHALL get each token value that it shows from the token source of the workbench.

#### Scenario: The tokens section

- **WHEN** a person opens the style guide
- **THEN** the tokens section shows a named swatch or sample for each palette color, each role, each radius step, and each shadow step

#### Scenario: A token value changes

- **WHEN** a person changes the value of `accent` in the token source and loads the style guide again
- **THEN** the swatch of `accent` shows the new value, and no file of the style guide was changed

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

### Requirement: The style guide is not in the workbench page

The style guide SHALL be a page of its own that a person starts with a command. A build of the workbench page SHALL NOT include the style guide. The style guide SHALL need no core and no host.

#### Scenario: Start the style guide

- **WHEN** no core runs and a person runs the command that starts the style guide
- **THEN** the command prints an address, and the style guide is shown at that address

### Requirement: The app bar edits its title

When the designer selects the title, the app bar SHALL show a text field with the title as the designer typed it, not in lowercase, with all its text selected. Enter or a move of the focus out of the field SHALL commit the text one time. Escape SHALL close the field with no input. A commit of an empty text or of the same title SHALL close the field with no input.

#### Scenario: Enter commits

- **WHEN** the designer selects the title `Wishem`, types `Wishem studio`, and presses Enter
- **THEN** the app bar calls the rename function one time with `Wishem studio`

#### Scenario: Enter and then a move of the focus

- **WHEN** the designer presses Enter, and the focus then leaves the field before the outcome
- **THEN** the rename function is called one time

#### Scenario: Escape

- **WHEN** the designer types a new title and presses Escape
- **THEN** the field closes, the title does not change, the rename function is not called, and the focus is on the title button

#### Scenario: An empty title

- **WHEN** the designer removes all the text and presses Enter
- **THEN** the field closes, and the rename function is not called

### Requirement: The app bar shows the state of a rename

While a rename waits for its outcome, the field SHALL be read-only, SHALL have `aria-busy="true"`, and SHALL have the mono label `Saving` beside it in `on-night`. After a rejection, the field SHALL stay open with the text of the designer, and a line below the bar SHALL show `The title is not saved.` and the reason in `danger-text` on `ground`, in an element with the role `alert`. After an accepted rename, the field SHALL close and the focus SHALL go to the title button.

#### Scenario: Saving

- **WHEN** the rename function did not give its outcome yet
- **THEN** the field is read-only, has `aria-busy="true"`, and the label `SAVING` shows beside it, and Escape and Enter do nothing

#### Scenario: Not saved

- **WHEN** the rename function gives a rejection with the reason text `The workbench does not run. Start it, and try again.`
- **THEN** the line below the bar shows `The title is not saved. The workbench does not run. Start it, and try again.`, and the field holds the text of the designer

#### Scenario: A new commit after a rejection

- **WHEN** the app bar shows a rejection, and the designer presses Enter again
- **THEN** the line of the rejection goes away, and the app bar calls the rename function again

#### Scenario: A move of the focus after a rejection

- **WHEN** the app bar shows a rejection, and the focus leaves the field
- **THEN** the app bar does not call the rename function, and the field and the line of the rejection stay

#### Scenario: The app bar is removed while it saves

- **WHEN** the app bar is removed from the page while a rename waits, and then the outcome arrives
- **THEN** no error occurs

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
