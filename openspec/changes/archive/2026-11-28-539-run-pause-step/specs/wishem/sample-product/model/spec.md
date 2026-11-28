# Spec Delta

## ADDED Requirements

### Requirement: The sample product has React views

The folder `views/react/` of the sample product SHALL hold two React views, each with a sidecar of the kind `react`. The view `ClearColor` SHALL attach to the component type `Color` (`ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512`) and SHALL fill a box of 320 by 180 CSS pixels with the value of the prop `color`. The view `Count` SHALL attach to the component type `Counter` and SHALL show the text `Count <value>`. A view with no value SHALL draw nothing.

#### Scenario: The color

- **WHEN** the view `ClearColor` gets the prop `color` with `#1d4ed8`
- **THEN** it draws an element with the role `img`, the name `Color #1d4ed8`, and the background color `#1d4ed8`

#### Scenario: The count

- **WHEN** the view `Count` gets the prop `count` with `42`
- **THEN** it shows the text `Count 42`

#### Scenario: No value

- **WHEN** a view of the sample product gets no value for its field
- **THEN** it draws nothing, and no error occurs

#### Scenario: The sidecars

- **WHEN** the React renderer collects the views of `views/react/`
- **THEN** the table has one view for `Color` and one view for `Counter`, and no error

### Requirement: The views of the sample product are not in its root entry

The root entry of the sample product SHALL NOT import or export a view. The views SHALL use only React, the types of the React renderer, and the standard library.

#### Scenario: The root entry

- **WHEN** a package imports the root entry of the sample product
- **THEN** it loads no module of React
