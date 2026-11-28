# Spec Delta

## MODIFIED Requirements

### Requirement: Each picture shows the fallback color when the state has no color

While the construct is paused, the test SHALL send these inputs through its link, in this order: `store/set-field` with `red`, `store/set-field` with `#15803d`, `store/clear-field` for the field `color`, `store/replace-model` with `#15803d` and a valid label, and `store/replace-model` with the label `???`. After each input, each pixel of each picture SHALL be `#ff00ff`, except after an input with `#15803d`.

#### Scenario: A value that is not a color

- **WHEN** the test sets the color to `red`
- **THEN** within 5 seconds each pixel of each picture is `#ff00ff`

#### Scenario: A color again

- **WHEN** the test then sets the color to `#15803d`
- **THEN** within 5 seconds each pixel of each picture is `#15803d`

#### Scenario: No value

- **WHEN** the test sends `store/clear-field` for the field `color` of the `Color` component of the sample entity
- **THEN** the hub accepts the input, the `Color` component holds no value, and within 5 seconds each pixel of each picture is `#ff00ff`

#### Scenario: A color again before the last step

- **WHEN** the test replaces the model with a model that has a valid label and the value `#15803d`
- **THEN** within 5 seconds each pixel of each picture is `#15803d`, so that the next step starts from a different color

#### Scenario: A label that gives an empty name

- **WHEN** the test replaces the model with a model in which the label of the field `color` is `???` and the value is `#1d4ed8`
- **THEN** within 5 seconds each pixel of each picture is `#ff00ff`

#### Scenario: One renderer hides its view

- **WHEN** one renderer draws nothing for a value that is not a color
- **THEN** the test fails at the check of that renderer
