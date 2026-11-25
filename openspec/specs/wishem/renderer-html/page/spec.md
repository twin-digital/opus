# wishem/renderer-html/page Specification

## Purpose

Defines the page of the HTML renderer: what it draws from the snapshot of a core, how the picture follows each change to the model, how an element on the screen gives its entity, and what the page shows when it has no snapshot.

## Requirements

### Requirement: The page draws each component that has a view

The page SHALL draw one picture for each component, of each entity in the snapshot, whose component type has a view. The page SHALL draw the pictures in one column, in the order of the entities in the snapshot. The root of the page SHALL NOT have a rule for a specific component type. The order SHALL NOT be a promise to a later version.

#### Scenario: The base workbench

- **WHEN** the model has one entity with an `AppBar` component whose title is `Wishem`
- **THEN** the page shows one app bar with the title `Wishem`

#### Scenario: Two entities with the same component type

- **WHEN** the authored state has two entities that each have an `AppBar` component
- **THEN** the page shows two app bars, in the order of the entities, and reports no error

#### Scenario: No entity

- **WHEN** the authored state has no entity
- **THEN** the page shows no app bar

### Requirement: The zero state is fixed content of the page

The page SHALL show the zero state of the component catalog in the space that the pictures of the views do not use. The zero state SHALL NOT come from the model.

#### Scenario: The app bar and the zero state

- **WHEN** the model has one entity with an `AppBar` component
- **THEN** the page shows the app bar at the top and the zero state in the space below it

#### Scenario: The model has no entity

- **WHEN** the authored state has no entity
- **THEN** the zero state uses the full page

### Requirement: The picture follows the model

After each change to the model that the core accepts, the page SHALL draw the new snapshot. The person SHALL NOT need to reload the page. The page SHALL change the picture only when the snapshot changes.

#### Scenario: A change to the title

- **WHEN** the page is open and a person changes the title in `state.json` from `Wishem` to `Wishem workbench` and saves the file
- **THEN** the app bar shows `Wishem workbench` with no reload

#### Scenario: The entity is removed

- **WHEN** the page is open and a person removes the entity from `state.json`
- **THEN** the app bar is not on the page

#### Scenario: The entity is added

- **WHEN** the page shows no app bar and a person adds an entity with an `AppBar` component to `state.json`
- **THEN** the page shows the app bar

### Requirement: The page keeps the last picture when the model is not correct

When the model files are not correct, the core keeps its last correct model. The page SHALL keep the picture of that model. The page SHALL show no message for the problem. The terminal of the command that started the core shows the problem.

#### Scenario: A file that is not valid JSON

- **WHEN** the page shows the title `Wishem` and a person saves `state.json` with text that is not valid JSON
- **THEN** the page continues to show `Wishem`

#### Scenario: The file is corrected

- **WHEN** the model files were not correct and a person saves a correct `state.json` with the title `Hello`
- **THEN** the page shows `Hello`

### Requirement: Each drawn element gives its entity

The renderer SHALL mark the picture of each component with the ID of its entity and the ID of its component type. The renderer SHALL add the mark. A view SHALL NOT need to add it. For each element in the picture of a component, a program SHALL be able to find the entity ID from the element.

#### Scenario: Find the entity of the app bar

- **WHEN** the page shows the app bar of the entity `e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2`
- **THEN** the heading of the app bar is in an element that is marked with that entity ID

#### Scenario: The mark does not change the layout

- **WHEN** the page draws the app bar with its mark
- **THEN** the app bar has the same size and position as the app bar of the style guide at the same width

### Requirement: The page uses only the address that served it

The page SHALL get the snapshots from the address that served the page. The page SHALL NOT need the address of the core. The page SHALL make no request to a different host.

#### Scenario: The page loads

- **WHEN** a web browser opens the address of the page
- **THEN** each request of the page goes to that address

### Requirement: The page shows its fixed content when it has no snapshot

Before the first snapshot arrives, the page SHALL show its fixed content and no view. When the connection to the core is lost, the page SHALL keep the last picture and SHALL connect again with no action of the person. After a new connection, the page SHALL draw the current snapshot.

#### Scenario: The core is not reachable when the page loads

- **WHEN** a web browser opens the page and the core does not answer
- **THEN** the page shows the zero state and no app bar, and the browser console has a message that the core is not reachable

#### Scenario: The connection comes back

- **WHEN** the connection to the core was lost, the title changed in that time, and the connection comes back
- **THEN** the page shows the new title with no reload

### Requirement: The page meets the accessibility rules of the style guide

The page SHALL pass the same accessibility checks as the style guide of the workbench, in light mode and in dark mode.

#### Scenario: The base workbench in each theme

- **WHEN** the page shows the app bar and the zero state, in light mode and in dark mode
- **THEN** the accessibility check finds no violation
