# Spec Delta

## ADDED Requirements

### Requirement: The button

The button SHALL show its label in UI text. The plain button SHALL use `surface`, `fg`, a 1-pixel border in `control-border`, and the radius of 4 pixels. The maker button SHALL use a border in `maker` and its label in `maker-text`, because the designer acts. Each button SHALL have a focus ring in `accent`. A disabled button SHALL have its label in `fg-muted` and SHALL NOT call its function.

#### Scenario: A maker button

- **WHEN** the style guide shows "Button, maker" with the label `Run`
- **THEN** the label has the color of `maker-text`, and the border has the color of `maker`

#### Scenario: A disabled button

- **WHEN** a disabled button gets a click, Enter, or Space
- **THEN** it does not call its function

### Requirement: The run bar

The run bar SHALL be a toolbar with the name `Product controls`. It SHALL hold, in this order, the mono label `Product`, the status as a mono label, the buttons `Run` or `Stop`, `Pause` or `Resume`, `Step`, and `Step back`, and the readout of the tick and the time as mono labels in `fg-muted`. `Run` and `Resume` SHALL be maker buttons.

#### Scenario: Paused

- **WHEN** the run bar gets the status `Paused` and the tick 42 of 50 milliseconds
- **THEN** it shows `PAUSED` in `warning-text`, the buttons `Stop`, `Resume`, `Step`, and `Step back` enabled, and `TICK 42` and `2.10 S`

#### Scenario: Arrow keys in the toolbar

- **WHEN** the focus is on a button of the run bar, and the person presses the right arrow key
- **THEN** the focus moves to the next enabled button

### Requirement: The run bar shows the status in a status role

The status of the run bar SHALL use `success-text` for `Running`, `warning-text` for `Paused`, `danger-text` for `Failed`, and `fg-muted` for each other status. A line of a refusal or of a failure SHALL be UI text in `danger-text` below the toolbar, with the role `alert`.

#### Scenario: Failed

- **WHEN** the run bar gets the status `Failed` and the message `Two behaviors have the ID sample-product/count.`
- **THEN** it shows `FAILED` in `danger-text`, and a line with the role `alert` holds the message

### Requirement: The stage frame

The stage frame SHALL be a region with the name `Stage` on `ground`, with a 1-pixel border in `line` and the radius of 4 pixels. It SHALL hold the picture that it gets, or the zero state with the label `Stage` and the text that it gets. Its picture SHALL NOT get a color, a font, or a size from the frame.

#### Scenario: No picture

- **WHEN** the stage frame gets the text `Not running. Press Run to start the product.` and no picture
- **THEN** it shows the zero state with the label `Stage` and that text

### Requirement: The run controls are in the style guide

The components section of the style guide SHALL show the button, the run bar, and the stage frame in each state, in light mode and in dark mode.

#### Scenario: The specimens of the run controls

- **WHEN** a person opens the components section
- **THEN** it shows, in light mode and in dark mode, the specimens "Button", "Button, maker", "Button, disabled", "Run bar, not running", "Run bar, starting", "Run bar, running", "Run bar, paused", "Run bar, paused at the start", "Run bar, failed", "Run bar, not done", "Run bar, no link", "Stage, not running", "Stage, connecting", "Stage, no views", "Stage, not reachable", and "Stage, a picture"
