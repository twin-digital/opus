# Spec Delta

## MODIFIED Requirements

### Requirement: The ClearColor React view fills the box

The page SHALL have one React view, `ClearColor`, attached to the component type `Color` of the sample product by its sidecar. The view SHALL fill the box of 640 by 360 pixels with the color of its prop `color`, as the requirement "A color of the sample construct is #rrggbb" of `wishem/renderers/sample-construct` gives it. When the prop has no value, or its value is not a color, the view SHALL fill the box with the fallback color `#ff00ff`.

#### Scenario: A color

- **WHEN** the prop `color` is `#1d4ed8`
- **THEN** each pixel of the box is `#1d4ed8`

#### Scenario: No value

- **WHEN** the component has no value for the field `color`
- **THEN** each pixel of the box is `#ff00ff`, and no error occurs

#### Scenario: A value that is not a color

- **WHEN** the prop `color` is `red` or `1d4ed8`
- **THEN** each pixel of the box is `#ff00ff`, and no error occurs

#### Scenario: A color with transparency

- **WHEN** the prop `color` is `#1d4ed880`
- **THEN** each pixel of the box is `#ff00ff`, and the background of the page does not show
