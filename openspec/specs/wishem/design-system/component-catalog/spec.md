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

The neutral roles SHALL have these values, as light mode then dark mode: `ground` `#F7F7FA` / `#121222`; `surface` `#FFFFFF` / `#1B1B30`; `fg` `#1C1C2E` / `#ECECF3`; `fg-muted` `#5B5B70` / `#A3A3B8`; `line` `#DEDEE7` / `#2D2D46`; `control-border` `#85859A` / `#6B6B88`. `night` SHALL be `ink`, `on-night` SHALL be `mist`, and `on-fill` SHALL be `ink`, in each theme.

#### Scenario: The page background in each theme

- **WHEN** the style guide is shown in light mode, and then in dark mode
- **THEN** the page background is `#F7F7FA`, and then `#121222`

#### Scenario: A role that does not change

- **WHEN** the style guide shows the swatch of `night` in light mode and in dark mode
- **THEN** the two swatches have the color `#17172A`

#### Scenario: The swatch of on-fill

- **WHEN** the style guide shows the tokens section in light mode and in dark mode
- **THEN** each one shows a swatch of `on-fill` next to the swatch of `on-night`, with the color `#17172A`

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

In each theme, each text role SHALL have a contrast ratio of 4.5 or more on `ground` and on `surface`. `on-fill` SHALL have a contrast ratio of 4.5 or more on each fill. `on-night` SHALL have a contrast ratio of 4.5 or more on `night`. `control-border` SHALL have a contrast ratio of 3 or more on `ground` and on `surface`.

#### Scenario: Maker text on the light ground

- **WHEN** the contrast ratio of `maker-text` on `ground` is calculated for light mode
- **THEN** the ratio is 4.5 or more

#### Scenario: A token value changes

- **WHEN** a person changes the value of a text role so that its contrast ratio on `ground` is less than 4.5
- **THEN** a test of the package fails and names the role

#### Scenario: The value of on-fill changes

- **WHEN** a person changes the value of `on-fill` so that its contrast ratio on `danger` is less than 4.5
- **THEN** a test of the package fails and names `on-fill` and `danger`

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

#### Scenario: The states of the button

- **WHEN** a person opens the components section and does not touch the page
- **THEN** it shows each of the four button variants in the default, hover, active, focus, disabled, and loading states

#### Scenario: Each component of the catalog

- **WHEN** a person opens the components section
- **THEN** it shows the panel, the field, the button, the text input, the text area, the select, the checkbox, the prompt box, the quote, the spirit aside, the maker line, the spirit line, the callout, the badge, and the divider

#### Scenario: The states of the app bar

- **WHEN** a person opens the components section
- **THEN** it shows the app bar in the states "App bar", "App bar, long title", "App bar, edit", "App bar, saving", and "App bar, not saved", in light mode and in dark mode

#### Scenario: The states of the components of the product panel

- **WHEN** a person opens the components section
- **THEN** it shows, in light mode and in dark mode, the specimens "Entity list", "Entity list, selected", "Entity list, empty", "Field row, string", "Field row, number", "Field row, boolean", "Field row, reference", "Field row, reference list", "Field row, reference list, empty", "Field row, reference list, saving", "Field row, reference list, not saved", "Field row, reference list, disabled", "Field row, no value", "Field row, saving", "Field row, not saved", "Field row, disabled", "Inspector, nothing selected", "Inspector, an entity", and "Product panel"

### Requirement: The style guide is not in the workbench page

The style guide SHALL be a page of its own that a person starts with a command. A build of the workbench page SHALL NOT include the style guide. The style guide SHALL need no core and no host.

#### Scenario: Start the style guide

- **WHEN** no core runs and a person runs the command that starts the style guide
- **THEN** the command prints an address, and the style guide is shown at that address

### Requirement: The style guide forces a state

It SHALL be possible to force the hover, active, and focus look of a component with an attribute, so that the style guide shows these states on a page that no person and no test touches. A forced state and the real state SHALL use the same style rule. A state that comes from a prop (disabled, loading, error, read-only, on, open, working) SHALL need no force.

#### Scenario: The forced hover of a button

- **WHEN** the style guide forces the hover state on a maker button, and the pointer is not on the button
- **THEN** the button has the same style as a maker button that the pointer is on

#### Scenario: An open select with no interaction

- **WHEN** a person opens the style guide and does not touch the page
- **THEN** the specimen of the open select shows its menu in the light scope and in the dark scope at the same time

### Requirement: The look of a component is fixed

A component of the catalog SHALL NOT accept a class name or an inline style from its caller. A control and a button SHALL pass each other native attribute to their element. A component that has variants SHALL select the variant by a `variant` property with a fixed set of names.

#### Scenario: A caller gives a class name

- **WHEN** a person writes code that gives a `className` to a button of the catalog
- **THEN** the type check of the package fails

#### Scenario: A native attribute

- **WHEN** a text input gets `name="speed"` and `aria-describedby="hint"`
- **THEN** the input element has the two attributes

### Requirement: Control text and the fill of a control

The text of a control and of a button SHALL be control text, at 14 pixels. A text input, a text area, a select, a checkbox, and the prompt box SHALL have the `ground` surface. The border of a text input, a text area, a select, a checkbox, the prompt box, and a neutral button SHALL use `control-border`. Text and a mark on a bright fill SHALL use `on-fill`.

#### Scenario: The text of a maker button

- **WHEN** a maker button is shown in light mode, and then in dark mode
- **THEN** its fill is `#F2A93B` and its text is `#17172A` in each theme

#### Scenario: The border of a text input

- **WHEN** a text input in the default state is shown in light mode
- **THEN** its border is `#85859A` and its text is 14 pixels

### Requirement: Focus on a text control

On a text input, a text area, a select, and the prompt box, focus SHALL change the color of the border to `maker-text` and draw a second pixel in the same color inside the border. Focus SHALL draw nothing outside the control and SHALL NOT change the size of the control. The focus look SHALL show for each focus, also after a click. A control that has an error and focus SHALL use `danger-text` for the two.

#### Scenario: Focus by a click

- **WHEN** a person clicks in a text input
- **THEN** the border is `maker-text`, a second pixel in `maker-text` is inside the border, and the input has the same size as before

#### Scenario: Error with focus

- **WHEN** a text input that has an error gets focus
- **THEN** the border and the second pixel are `danger-text`

### Requirement: The focus ring of a button and a checkbox

On a button and a checkbox, keyboard focus SHALL draw a ring of 2 pixels in `maker-text` outside the control, 2 pixels from its edge. The ring SHALL NOT show after a click of the pointer.

#### Scenario: Focus by the Tab key

- **WHEN** a person moves focus to a button with the Tab key
- **THEN** the button shows the ring

#### Scenario: Focus by a click

- **WHEN** a person clicks a button
- **THEN** the button does not show the ring

### Requirement: The panel

The panel SHALL be a `surface` box with a `line` border, a radius of 8 pixels, and the small shadow. It SHALL show a body, an optional header, and an optional footer. The header SHALL show when the panel has a title or content for the end of the header. The title SHALL be a heading 2, drawn as control text with a weight of 600. The footer SHALL put its content at the end of the line.

#### Scenario: A plain panel

- **WHEN** a panel gets a body and no title, no header content, and no footer
- **THEN** it shows the body only, with no header line and no footer line

#### Scenario: A panel with a header and a footer

- **WHEN** a panel gets the title `Replays`, a badge for the end of the header, and two buttons for the footer
- **THEN** the header shows `Replays` as a heading 2 with the badge at its end, and the footer shows the two buttons at the end of the line

### Requirement: The field

The field SHALL show a label above one control, and an optional error message below it in `danger-text` as small text. The field SHALL connect its parts: the label names the control, the error message describes the control, and a field with an error message puts its control in the error state. A control in a field SHALL need no identifier from the caller.

#### Scenario: A field with an error message

- **WHEN** a field has the label `Speed`, a text input, and the error message `Enter a number.`
- **THEN** the input has the error look, a screen reader announces the input as `Speed`, as not valid, with the description `Enter a number.`

#### Scenario: A click on the label

- **WHEN** a person clicks the label of a field that holds a text input
- **THEN** the input gets focus

#### Scenario: A click on the label of a select

- **WHEN** a person clicks the label of a field that holds a select
- **THEN** the trigger of the select gets focus, and the menu stays closed

#### Scenario: A control with no field

- **WHEN** a text input with no field around it is marked as not valid by its caller
- **THEN** the input has the error look and a screen reader announces it as not valid

### Requirement: The button variants

The button SHALL have four variants: `maker`, a `maker` fill with `on-fill` text; `neutral`, a `surface` fill with a `control-border` border and `fg` text; `quiet`, no fill and no border, with `fg-muted` text; and `danger`, a `danger` fill with `on-fill` text. The default variant SHALL be `neutral`. A button SHALL NOT submit a form unless its caller says so.

#### Scenario: A button with no variant

- **WHEN** a button gets no variant
- **THEN** it is drawn as a neutral button

#### Scenario: A button in a form

- **WHEN** a person clicks a button with no stated type in a form
- **THEN** the form is not submitted

### Requirement: The states of a button

A button SHALL show a hover state and an active state that are different from the default state, and the active state SHALL move the button down by 1 pixel. A disabled button SHALL be dimmed and SHALL NOT react. A loading button SHALL show a spinner before its label, SHALL ignore a click, SHALL stay in the focus order, SHALL be announced as busy, and SHALL NOT be dimmed.

#### Scenario: A click on a loading button

- **WHEN** a person clicks a loading button
- **THEN** the click handler of the caller does not run

#### Scenario: The Tab key and a loading button

- **WHEN** a person moves focus with the Tab key through a form that has a loading button
- **THEN** the loading button gets focus

#### Scenario: A loading danger button

- **WHEN** a loading danger button is shown
- **THEN** its fill and its text have the same colors as a danger button in the default state

### Requirement: The text input and the text area

The text input and the text area SHALL have these states: default, hover, focus, error, disabled, and read-only, each with a value and with no value. Hover SHALL change the border to `fg-muted`. A disabled control SHALL be dimmed. A read-only control SHALL have a dashed border, no fill, and `fg-muted` text. A placeholder SHALL use `fg-muted`. A person SHALL be able to drag the height of a text area, and not its width.

#### Scenario: A read-only input

- **WHEN** a text input is read-only and shows `e_c0d5e6f1`
- **THEN** it has a dashed border and `fg-muted` text, and a person can select the text and cannot change it

#### Scenario: An empty input

- **WHEN** a text input has no value and the placeholder `Name`
- **THEN** it shows `Name` in `fg-muted`

### Requirement: A text control does not connect to a model

The text input and the text area SHALL show the value that the caller gives and report each change to the caller, or hold their own text from a first value. They SHALL NOT read or write a model.

#### Scenario: The caller holds the value

- **WHEN** the caller gives the value `Cave bat`, a person types `s`, and the caller does not change the value
- **THEN** the caller is told about the change, and the input still shows `Cave bat`

### Requirement: The select

The select SHALL be drawn by the catalog and SHALL NOT be the native select of the web browser. It SHALL show the label of the option that has the given value, with a chevron at its end. It SHALL hold no value: it reports a selection to the caller, and shows a new value only when the caller gives it. The options SHALL be data: each one has a value, a label, and an optional disabled mark. It SHALL have the states default, hover, focus, error, disabled, and open.

#### Scenario: A person selects an option

- **WHEN** the select shows `Enemy`, a person opens it and selects `Prop`
- **THEN** the caller is told the value of `Prop`, and the menu closes

#### Scenario: No value

- **WHEN** the select gets no value and the placeholder `Select a kind`
- **THEN** the trigger shows `Select a kind` in `fg-muted`

### Requirement: The menu of the select

The menu SHALL be a `surface` box with a `line` border, a radius of 8 pixels, and the medium shadow, next to the trigger and as wide as the trigger. It SHALL mark the selected option with a check mark in `maker-text`, and highlight the option under the pointer or the keyboard. A disabled option SHALL be dimmed, and a person SHALL NOT be able to select it. An open select SHALL NOT lock the page.

#### Scenario: A disabled option

- **WHEN** a person clicks a disabled option of an open select
- **THEN** the caller is not told about a selection, and the menu stays open

#### Scenario: No options

- **WHEN** a person opens a select that has no options
- **THEN** the menu opens and shows no option, and the select is not disabled

#### Scenario: Two open selects

- **WHEN** the style guide shows an open select in the light scope and an open select in the dark scope
- **THEN** the two menus are open at the same time, and a person can scroll the page

### Requirement: The menu of the select is in view

The menu SHALL open below the trigger when it fits there, and above the trigger when the space below is too small. When the menu fits on neither side, it SHALL use the side with more space, and its list SHALL scroll. The whole menu SHALL be in the visible area of the page when it opens.

#### Scenario: A select near the bottom of the window

- **WHEN** a person opens a select whose trigger is nearer to the bottom edge of the window than the height of its menu
- **THEN** the menu opens above the trigger, and the whole menu is in the visible area

#### Scenario: A select near the top of the window

- **WHEN** a person opens a select that has space for its menu below the trigger
- **THEN** the menu opens below the trigger

#### Scenario: A window that is too short for the menu

- **WHEN** a person opens a select in a window that has too little space for the menu above the trigger and below it
- **THEN** the whole menu is in the visible area, and its list scrolls

### Requirement: The select with a keyboard and a screen reader

A person SHALL be able to use the select with a keyboard only: open it, move through the options with the arrow keys, Home, and End, go to an option by typing its first letters, select with Enter, and close with Escape. A screen reader SHALL announce the select as a control that opens a list, with its name, its value, and its open state.

#### Scenario: Select with the keyboard

- **WHEN** the select has focus and shows `Enemy`, and a person presses Enter, then the Down Arrow key, then Enter
- **THEN** the caller is told the value of the option after `Enemy`, the menu closes, and the trigger has focus

#### Scenario: Close with Escape

- **WHEN** the menu is open and a person presses Escape
- **THEN** the menu closes, the caller is not told about a selection, and the trigger has focus

### Requirement: A popup is in the theme scope of its control

The menu of a select SHALL be drawn in the theme scope of that select. A later popup of the catalog SHALL follow the same rule.

#### Scenario: A select in a dark scope of a light page

- **WHEN** a select in a part of the page that forces dark mode is open, and the page is in light mode
- **THEN** the menu has the dark value of `surface`, and it is a descendant of the element that forces dark mode

### Requirement: A select value that is not in the options

When the value of a select is not the value of one of its options, the trigger SHALL show the text of the value, and the menu SHALL NOT list it. The select SHALL NOT show the error look by itself, SHALL NOT change the value, and SHALL NOT report a change until a person selects an option.

#### Scenario: The component type was removed

- **WHEN** a select gets the value `Goat` and the options `Enemy`, `Prop`, and `Pickup`
- **THEN** the trigger shows `Goat` with the default look, the menu lists the three options with no check mark, and the caller is told nothing

### Requirement: The checkbox

The checkbox SHALL be a native checkbox that the catalog draws, 16 pixels square, with its label after it. It SHALL have the states off and on, and no mixed state. It SHALL hold no value: it reports a change to the caller. Off, it has a `control-border` border on `ground`. On, it has a `maker` fill, a `maker-text` border, and a check mark in `on-fill`. Hover SHALL change the look, and a disabled checkbox SHALL be dimmed.

#### Scenario: A click on the label

- **WHEN** a checkbox is off and a person clicks its label
- **THEN** the caller is told `on`, and the checkbox stays off until the caller gives the new value

#### Scenario: The Space key

- **WHEN** a checkbox has focus and a person presses Space
- **THEN** the caller is told the other value

### Requirement: The prompt box

The prompt box SHALL be a `ground` box with a `control-border` border and a radius of 8 pixels. It SHALL hold a text area with no border of its own, in the mono typeface at 16 pixels in `maker-text`, and below it one line with a hint text and one button. It SHALL have a name for a screen reader, which the caller gives. Idle, the hint text is `Enter to send · Shift+Enter for a new line` and the button is the maker button `Make a wish`.

#### Scenario: An empty prompt box

- **WHEN** the prompt box holds no text
- **THEN** it shows its placeholder in `fg-muted`, and the button `Make a wish` is disabled

#### Scenario: Focus with text

- **WHEN** the text of the prompt box has focus and holds `make the bats flee`
- **THEN** the box has the focus look of a text control, and the button `Make a wish` is enabled

### Requirement: The height of the prompt box

The prompt box SHALL grow with its text from a minimum number of lines to a maximum number of lines, and then the text SHALL scroll. The caller SHALL be able to set the two numbers. The defaults SHALL be 3 and 8. When the two numbers are the same, the box SHALL NOT grow. The box SHALL grow in the flow of the layout, and a person SHALL NOT be able to drag its edge.

#### Scenario: Five lines of text

- **WHEN** a prompt box with the default numbers holds five lines of text
- **THEN** the text area is five lines high and has no scroll bar

#### Scenario: Twelve lines of text

- **WHEN** a prompt box with the default numbers holds twelve lines of text
- **THEN** the text area is eight lines high and the text scrolls

### Requirement: The prompt box sends

Enter, or a click on `Make a wish`, SHALL report "send" with the text to the caller. Shift+Enter SHALL make a new line. Enter SHALL do nothing when the text is empty or has only spaces, and while an input method composes a character. The prompt box SHALL hold its text, and the caller SHALL be able to give the text that a new box starts with. The prompt box SHALL NOT know what a wish does.

#### Scenario: Enter with text

- **WHEN** the box holds `make the bats flee` and a person presses Enter
- **THEN** the caller is told "send" with `make the bats flee`, and no new line is added

#### Scenario: Enter with only spaces

- **WHEN** the box holds three spaces and a person presses Enter
- **THEN** the caller is told nothing

#### Scenario: Enter during composition

- **WHEN** an input method composes a character and a person presses Enter to accept it
- **THEN** the caller is told nothing

### Requirement: The working state of the prompt box

While the caller says that work is in progress, the prompt box SHALL be locked: the text stays and is read-only in `fg-muted`, the text is out of the focus order, the border is `spirit`, the hint line shows a spinner and `Wishem is working` in `spirit-text`, and the neutral button `Stop` is the only action. `Stop` SHALL report "stop" to the caller. A box SHALL lock also when it did not send, and it then keeps its draft in view.

#### Scenario: A box that is made while work runs

- **WHEN** a prompt box is made in the working state with the first text `make the bats flee`
- **THEN** it shows that text as read-only, with the `spirit` border and the button `Stop`

#### Scenario: Enter in the working state

- **WHEN** the box is in the working state and a person presses Enter
- **THEN** the caller is told nothing

### Requirement: The prompt box when the work ends

When the work ends, the prompt box SHALL become empty only if it reported "send" for this work and did not report "stop" after it. In each other case, the text SHALL stay, and a person SHALL be able to edit it.

#### Scenario: This box sent, and the work ended

- **WHEN** the box reported "send", the caller started the working state, and the caller then ended it
- **THEN** the box is empty

#### Scenario: This box sent, and the designer stopped

- **WHEN** the box reported "send", then "stop", and the caller ended the working state
- **THEN** the box shows the sent text, and a person can edit it

#### Scenario: The work started while the designer typed

- **WHEN** the box holds a draft that was not sent, the caller starts the working state, and then ends it
- **THEN** the box shows the draft, and a person can edit it and send it

### Requirement: Focus and the working state of the prompt box

When the working state starts and the text has focus, focus SHALL move to `Stop`. When the working state ends and `Stop` has focus, focus SHALL return to the text.

#### Scenario: Send with the keyboard, then stop

- **WHEN** a person presses Enter in the text, the working state starts, the person presses Enter again, and the working state ends
- **THEN** the second Enter reported "stop", and the text has focus

### Requirement: The disabled state of the prompt box

A disabled prompt box SHALL dim its text area and its button, and the two SHALL NOT react. The caller SHALL be able to give a reason, which the hint line shows in the place of the hint text. The reason SHALL NOT be dimmed. When the working state and the disabled state are true together, the box SHALL show the disabled state.

#### Scenario: Not connected

- **WHEN** a prompt box is disabled with the reason `Not connected`
- **THEN** the hint line shows `Not connected` in full `fg-muted`, and the text area and the button are dimmed

#### Scenario: Working and disabled

- **WHEN** a prompt box is in the working state and is disabled
- **THEN** it shows the disabled state, and it does not show `Stop`

### Requirement: The quote and the spirit aside

The quote SHALL show text in italic with a bar of 3 pixels in `accent` at its start, and an optional source below it in `fg-muted`, not in italic. The spirit aside SHALL show text with a bar of 3 pixels in `spirit` at its start and a light `spirit` tint behind it. The spirit aside SHALL start with the fixed signature `Wishem:` in `spirit-text` and in bold.

#### Scenario: A quote with a source

- **WHEN** a quote gets the text `A kit is what the first game leaves behind.` and the source `rules.md, R7`
- **THEN** the text is in italic, and `rules.md, R7` is below it in `fg-muted` and not in italic

#### Scenario: The signature of the aside

- **WHEN** a spirit aside gets the text `This is my favourite trick.`
- **THEN** it shows `Wishem: This is my favourite trick.`, and `Wishem:` has the `spirit-text` color

### Requirement: The maker line and the spirit line

The maker line SHALL show one text of the designer in the mono typeface at 16 pixels in `maker-text`, with `>` and a space before it. The component draws the `>`. The spirit line SHALL show one text of Wishem as UI text in `spirit-text`.

#### Scenario: A maker line

- **WHEN** a maker line gets the text `make the bats flee`
- **THEN** it shows `> make the bats flee` in JetBrains Mono in the `maker-text` color

#### Scenario: A spirit line

- **WHEN** a spirit line gets the text `Done.`
- **THEN** it shows `Done.` in Inter in the `spirit-text` color

### Requirement: The callout

The callout SHALL have four variants: `success`, `warning`, `danger`, and `info`. It SHALL show its content in `fg` in a box with a radius of 8 pixels, a bar of 3 pixels in the status fill at its start, and a light tint of the status fill behind it. An optional title SHALL come before the content, in bold, in the status text role.

#### Scenario: A warning with a title

- **WHEN** a callout gets the variant `warning`, the title `Check this.`, and the text `Two runs got stuck in room 3.`
- **THEN** the bar is `warning`, `Check this.` is in bold in `warning-text`, and the text is in `fg`

### Requirement: The badge

The badge SHALL show one short text on one line as a pill: the mono typeface at 11 pixels, in uppercase, with a border in a lighter tone of the text color and no fill. It SHALL have the variants `neutral`, `maker`, `spirit`, `accent`, `success`, `warning`, `danger`, and `info`. `neutral` SHALL use `fg-muted`, and each other variant SHALL use its text role. The default variant SHALL be `neutral`.

#### Scenario: A status badge

- **WHEN** a badge gets the variant `danger` and the text `Failed`
- **THEN** it shows `FAILED` on one line in `danger-text`

### Requirement: The divider

The divider SHALL have two variants. `plain` SHALL be a line of 1 pixel in `line` that fills the width. `accent` SHALL be a line of 2 pixels in `accent`, 56 pixels wide, at the start. The default variant SHALL be `plain`.

#### Scenario: The two dividers

- **WHEN** the style guide shows a plain divider and an accent divider in a box of 400 pixels
- **THEN** the plain divider is 400 pixels wide and 1 pixel high, and the accent divider is 56 pixels wide and 2 pixels high

### Requirement: Only a control that is not active is dimmed

A component SHALL dim only a control that a person cannot use: a disabled control and a disabled option. Text that a person reads or uses SHALL keep a contrast ratio of 4.5 or more on its background in each theme, in each state. This includes the text of a button in its hover and active states, the reason text of a disabled prompt box, and the text of a loading button.

#### Scenario: The active danger button

- **WHEN** the contrast ratio of the text of a danger button on its fill in the active state is calculated
- **THEN** the ratio is 4.5 or more

#### Scenario: A state gets a look with low contrast

- **WHEN** a person changes the look of a state that a person uses so that its text has a contrast ratio of less than 4.5
- **THEN** a test of the package fails and names the state and the theme

### Requirement: A component follows the width of its container

A component SHALL follow the width of its container and SHALL NOT read the width of the window. In a container of 240 pixels or more, content that does not fit SHALL wrap or be cut with an ellipsis, and SHALL NOT overflow the component. The catalog promises no layout for a narrower container, and has no layout for a phone.

#### Scenario: A panel with a form in a narrow box

- **WHEN** a panel with a long title, a field with a text input, a field with a select, and three footer buttons is shown in a box of 260 pixels
- **THEN** the title is cut with an ellipsis, each control fills the width, the buttons wrap to a second line, and nothing is drawn outside the panel

#### Scenario: A select with a long value

- **WHEN** a select in a box of 260 pixels shows a value that is longer than the trigger
- **THEN** the value is cut with an ellipsis, the menu is as wide as the trigger, and a long option wraps

#### Scenario: A narrow prompt box

- **WHEN** a prompt box is shown in a box of 260 pixels
- **THEN** the hint text and the button are on two lines, and the button is fully visible

### Requirement: Text that does not fit

A button and a badge SHALL keep their text on one line. The label of a checkbox SHALL wrap, and the box SHALL stay at the first line. The error message of a field SHALL wrap. In a quote, a spirit aside, a maker line, a spirit line, and a callout, the text SHALL wrap, and a long word with no space SHALL break.

#### Scenario: An identifier in a callout

- **WHEN** a callout in a box of 260 pixels shows a word of 60 characters with no space
- **THEN** the word breaks at the edge of the callout, and the callout is not wider than the box

#### Scenario: A checkbox with a long label

- **WHEN** a checkbox in a box of 260 pixels has a label of three lines
- **THEN** the box is at the first line of the label

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

The field row SHALL show the label of the field in UI text, the type of the field as a mono label in `fg-muted`, the control for the type, and a neutral button with the label `Clear` after the control. The text field and the select SHALL use `surface`, `fg`, `control-border`, a focus ring in `accent`, and, for the text field, a caret in `maker`. The check box SHALL have the label of the field as its accessible name. The text `no value` SHALL be a mono label in `fg-muted`.

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

### Requirement: The button

The button SHALL show its label in control text, with the radius of 4 pixels. Its look in each variant and state SHALL follow "The button variants" and "The states of a button". A maker button marks an action of the designer. A disabled button SHALL keep the focus and its place in the tab order, SHALL have `aria-disabled`, and SHALL NOT call its function.

#### Scenario: A maker button

- **WHEN** the style guide shows "Button, maker" with the label `Run`
- **THEN** the button has the `maker` fill, and the label has the color of `on-fill`

#### Scenario: A disabled button

- **WHEN** a disabled button gets a click, Enter, or Space
- **THEN** it does not call its function, and it keeps the focus

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

### Requirement: A button can have an accessible name

A button SHALL be able to have an accessible name that is different from its label. That name SHALL start with the label. The look of the button SHALL NOT change.

#### Scenario: An accessible name

- **WHEN** a button has the label `Clear` and the accessible name `Clear count`
- **THEN** it shows `Clear`, and its accessible name is `Clear count`

### Requirement: The field row of a list of references

The list control SHALL show each item as UI text with the short ID as a mono label in `fg-muted`, and each button `Remove` and `Add` as a neutral button. The select SHALL use the colors of the select of a `reference` field. The text `empty list` SHALL be a mono label in `fg-muted`. The items, the select, and the buttons SHALL be in a group whose accessible name is the label of the field.

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
