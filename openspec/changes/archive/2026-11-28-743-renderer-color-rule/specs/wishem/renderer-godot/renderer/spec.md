# Spec Delta

## MODIFIED Requirements

### Requirement: The ClearColor view fills the viewport

The view `ClearColor` SHALL make one rectangle node that covers the full viewport, with the color of the prop `color`, as the requirement "A color of the sample construct is #rrggbb" of `wishem/renderers/sample-construct` gives it. When the prop has no value or is not a color, the node SHALL have the fallback color `#ff00ff`. The node SHALL stay visible.

#### Scenario: A color

- **WHEN** the prop `color` is `#b91c1c` and the viewport is 640 by 360 pixels
- **THEN** the node is visible, covers 640 by 360 pixels, and has the color `#b91c1c`

#### Scenario: A value that is not a color

- **WHEN** the prop `color` is `not a color`
- **THEN** the node is visible, covers the viewport, and has the color `#ff00ff`

#### Scenario: No value

- **WHEN** the props have no `color`
- **THEN** the node is visible and has the color `#ff00ff`

#### Scenario: A color that Godot reads and the rule refuses

- **WHEN** the prop `color` is `1d4ed8` or `#1d4ed880`
- **THEN** the node has the color `#ff00ff`, with an alpha of 1
