# Spec Delta

## MODIFIED Requirements

### Requirement: Each picture shows the same state of the hub

At each check, the test SHALL read the joined state of the sample construct through a link of its own. Each pixel of the picture of each renderer SHALL be the color that the requirement "A color of the sample construct is #rrggbb" of `wishem/renderers/sample-construct` gives for the color of the sample entity in that state, or the fallback color `#ff00ff` when that state has no color.

#### Scenario: The first picture

- **WHEN** the three renderers connect to the paused construct at tick 0
- **THEN** each pixel of the picture of each renderer is `#1d4ed8`

#### Scenario: One renderer draws a different hub

- **WHEN** one renderer connects to a different construct
- **THEN** the test fails at the check of that renderer after the step

## ADDED Requirements

### Requirement: Each picture shows the fallback color when the state has no color

While the construct is paused, the test SHALL send these inputs through its link, in this order: `store/set-field` with `red`, `store/set-field` with `#15803d`, `store/replace-model` with no value for the field `color`, `store/replace-model` with `#15803d` and a valid label, and `store/replace-model` with the label `???`. After each input, each pixel of each picture SHALL be `#ff00ff`, except after an input with `#15803d`.

#### Scenario: A value that is not a color

- **WHEN** the test sets the color to `red`
- **THEN** within 5 seconds each pixel of each picture is `#ff00ff`

#### Scenario: A color again

- **WHEN** the test then sets the color to `#15803d`
- **THEN** within 5 seconds each pixel of each picture is `#15803d`

#### Scenario: No value

- **WHEN** the test replaces the model with a model whose `Color` component has no value for the field `color`
- **THEN** within 5 seconds each pixel of each picture is `#ff00ff`

#### Scenario: A color again before the last step

- **WHEN** the test replaces the model with a model that has a valid label and the value `#15803d`
- **THEN** within 5 seconds each pixel of each picture is `#15803d`, so that the next step starts from a different color

#### Scenario: A label that gives an empty name

- **WHEN** the test replaces the model with a model in which the label of the field `color` is `???` and the value is `#1d4ed8`
- **THEN** within 5 seconds each pixel of each picture is `#ff00ff`

#### Scenario: One renderer hides its view

- **WHEN** one renderer draws nothing for a value that is not a color
- **THEN** the test fails at the check of that renderer
