# Spec Delta

## MODIFIED Requirements

### Requirement: The ClearColor view fills the viewport

The page SHALL have one PixiJS view, `ClearColor`, attached to the component type `Color` of the sample product by its sidecar. The view SHALL fill the full viewport with the color of its prop `color`, as the requirement "A color of the sample construct is #rrggbb" of `wishem/renderers/sample-construct` gives it. When the prop has no value, or its value is not a color, the view SHALL fill the full viewport with the fallback color `#ff00ff`. The display object of the view SHALL stay visible.

#### Scenario: A color

- **WHEN** the prop `color` is `#1d4ed8`
- **THEN** the display object of the view covers the viewport and has the color `#1d4ed8`

#### Scenario: A value that is not a color

- **WHEN** the prop `color` is `blue-ish`
- **THEN** the display object of the view is visible, covers the viewport, and has the color `#ff00ff`, and no error occurs

#### Scenario: No value

- **WHEN** the prop `color` has no value
- **THEN** the display object of the view is visible and has the color `#ff00ff`

#### Scenario: A color that PixiJS reads and the rule refuses

- **WHEN** the prop `color` is `red`, `rgb(29, 78, 216)`, `1d4ed8`, or `#1d4ed880`
- **THEN** the display object of the view has the color `#ff00ff`, with no transparency

#### Scenario: The sidecar

- **WHEN** a test reads `src/views/ClearColor.view.json`
- **THEN** it has the kind `pixi` and the component type `ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512`
