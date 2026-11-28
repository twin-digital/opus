# Spec Delta

## MODIFIED Requirements

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

### Requirement: Each component is in the style guide

Each component of the workbench SHALL be in the components section of the style guide. The style guide SHALL show each component in each of its states, and it SHALL show the real component, not a copy.

#### Scenario: The first components

- **WHEN** a person opens the components section
- **THEN** it shows the app bar with a title, and the zero state

#### Scenario: The states of the app bar

- **WHEN** a person opens the components section
- **THEN** it shows the app bar in the states "App bar", "App bar, long title", "App bar, edit", "App bar, saving", and "App bar, not saved", in light mode and in dark mode

## ADDED Requirements

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
