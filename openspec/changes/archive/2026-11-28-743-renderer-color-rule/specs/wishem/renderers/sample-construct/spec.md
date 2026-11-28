# Spec Delta

## ADDED Requirements

### Requirement: A color of the sample construct is #rrggbb

A value of the field `color` of the component type `Color` SHALL be a color when it is text of the form `#rrggbb`: `#` and six hexadecimal digits, in upper case or lower case. Each other value SHALL NOT be a color. The `ClearColor` view of the React page, of the PixiJS page, and of the Godot application SHALL each fill the full viewport with a color value, with no transparency.

#### Scenario: A color in lower case

- **WHEN** the color of the sample entity is `#1d4ed8`
- **THEN** each pixel of the picture of each of the three renderers is `#1d4ed8`

#### Scenario: A color in upper case

- **WHEN** the color of the sample entity is `#1D4ED8`
- **THEN** each pixel of the picture of each of the three renderers is `#1d4ed8`

#### Scenario: Other forms of a color in CSS

- **WHEN** the color of the sample entity is `red`, `rgb(29, 78, 216)`, `transparent`, `#fff`, or `#1d4ed880`
- **THEN** the value is not a color

#### Scenario: No hash sign

- **WHEN** the color of the sample entity is `1d4ed8`
- **THEN** the value is not a color

### Requirement: The three renderers draw one fallback color

For no value of the field `color`, and for a value that is not a color, the `ClearColor` view of the React page, of the PixiJS page, and of the Godot application SHALL fill the full viewport with the fallback color `#ff00ff`. A field whose label gives an empty name gives no prop, so the view SHALL draw the fallback color for it too. No view SHALL be hidden, and no error SHALL occur.

#### Scenario: No value

- **WHEN** the `Color` component of the sample entity has no value for the field `color`
- **THEN** each pixel of the picture of each of the three renderers is `#ff00ff`

#### Scenario: A value that is not a color

- **WHEN** the color of the sample entity is `red`
- **THEN** each pixel of the picture of each of the three renderers is `#ff00ff`

#### Scenario: A label that gives an empty name

- **WHEN** the label of the field `color` is `???`
- **THEN** no view gets the prop `color`, and each pixel of the picture of each of the three renderers is `#ff00ff`

#### Scenario: A color after a value that is not a color

- **WHEN** the color of the sample entity is `red` and then `#15803d`
- **THEN** each pixel of the picture of each of the three renderers is `#15803d`

### Requirement: One table of color cases

The package `@thrashplay/wishem-sample-product` SHALL export a table of color cases and the fallback color from its subpath `color-cases`. Each case SHALL hold a name, a value or no value, and the color in lower case that a view draws for it. The table SHALL hold each value of the scenarios of "A color of the sample construct is #rrggbb", no value, and each color of the color behavior. The tests of each of the three `ClearColor` views SHALL check each case.

#### Scenario: The colors of the color behavior

- **WHEN** a test reads the table
- **THEN** each color of the color behavior is a case that gives the same color

#### Scenario: A renderer that does not follow the rule

- **WHEN** the view of one renderer draws a different color for one case of the table
- **THEN** a unit test of the package of that view fails

#### Scenario: The copy of the table for Godot

- **WHEN** the JSON copy of the table in `renderer-godot` differs from the table of the sample product
- **THEN** a unit test of `renderer-godot` fails
