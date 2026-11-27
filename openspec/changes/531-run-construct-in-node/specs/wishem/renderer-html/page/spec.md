# Spec Delta

## MODIFIED Requirements

### Requirement: The page draws each component that has a view

The page SHALL draw one picture for each component, of each entity in the part `store`, whose component type has a view. The page SHALL draw the pictures in one column, in the order of the entities in the part `store`. The root of the page SHALL NOT have a rule for a specific component type. The order SHALL NOT be a promise to a later version.

#### Scenario: The base workbench

- **WHEN** the model has one entity with an `AppBar` component whose title is `Wishem`
- **THEN** the page shows one app bar with the title `Wishem`

#### Scenario: Two entities with the same component type

- **WHEN** the authored state has two entities that each have an `AppBar` component
- **THEN** the page shows two app bars, in the order of the entities, and reports no error

#### Scenario: No entity

- **WHEN** the authored state has no entity
- **THEN** the page shows no app bar

### Requirement: The picture follows the model

After each input that changes the part `store` of the joined state, the page SHALL draw the new model. The person SHALL NOT need to reload the page. The page SHALL change the picture only when the part `store` changes.

#### Scenario: A change to the title

- **WHEN** the page is open and a person changes the title in `state.json` from `Wishem` to `Wishem workbench` and saves the file
- **THEN** the app bar shows `Wishem workbench` with no reload

#### Scenario: The entity is removed

- **WHEN** the page is open and a person removes the entity from `state.json`
- **THEN** the app bar is not on the page

#### Scenario: The entity is added

- **WHEN** the page shows no app bar and a person adds an entity with an `AppBar` component to `state.json`
- **THEN** the page shows the app bar

#### Scenario: An input of a different subsystem

- **WHEN** the page is open and an input subsystem of a different process sends `store/set-field` that sets the title to `Hello`
- **THEN** the app bar shows `Hello` with no reload

#### Scenario: An input that does not change the store

- **WHEN** the page is open and the hub applies an input after which the part `store` is the same object
- **THEN** the page does not draw again

### Requirement: The page keeps the last picture when the model is not correct

When the model files are not correct, the store keeps its last correct model. The page SHALL keep the picture of that model. The page SHALL show no message for the problem. The terminal of the command that started the construct shows the problem.

#### Scenario: A file that is not valid JSON

- **WHEN** the page shows the title `Wishem` and a person saves `state.json` with text that is not valid JSON
- **THEN** the page continues to show `Wishem`

#### Scenario: The file is corrected

- **WHEN** the model files were not correct and a person saves a correct `state.json` with the title `Hello`
- **THEN** the page shows `Hello`

### Requirement: The page uses only the address that served it

The page SHALL open its link at the path `/link` of the address that served the page, with `ws:` for `http:` and `wss:` for `https:`. The page SHALL NOT need the address of the hub. The page SHALL make no request to a different host.

#### Scenario: The page loads

- **WHEN** a web browser opens the address of the page
- **THEN** each request of the page and its WebSocket go to that address

## ADDED Requirements

### Requirement: The page shows its fixed content before the first link

Before the first `welcome` message arrives, the page SHALL show its fixed content and no view. While the hub is not reachable, the page SHALL write one warning to the browser console and SHALL try again with no action of the person.

#### Scenario: The hub is not reachable when the page loads

- **WHEN** a web browser opens the page and the hub does not answer
- **THEN** the page shows the zero state and no app bar, and the browser console has one message that the hub is not reachable

#### Scenario: The hub starts later

- **WHEN** the page loaded while the hub was not reachable, and then the hub starts
- **THEN** the page shows the app bar with no reload

### Requirement: The page is one output subsystem of the hub

The page SHALL attach to the hub through a link as one output subsystem. The ID of the subsystem SHALL be `page-` and random lowercase hexadecimal digits, new for each link, so that two pages of one construct do not use one ID. The page SHALL send no input.

#### Scenario: Two pages

- **WHEN** a person opens the address of the page in two tabs
- **THEN** each tab shows the app bar, and each tab follows the next change of the model

#### Scenario: The record after a page connects

- **WHEN** a page opens a link and draws the model
- **THEN** the record of the hub holds no input with a source that starts with `page-`

### Requirement: The page connects again after the link ends

When the link ends and the page did not close it, the page SHALL keep the last picture, SHALL write one warning to the browser console, and SHALL open a new link after a delay. The first delay SHALL be 500 ms. Each later delay SHALL be two times the one before, to a maximum of 5 s. After a new `welcome` message, the page SHALL draw its state, and the next end SHALL start at 500 ms again.

#### Scenario: The connection comes back

- **WHEN** the link ended, the title changed in that time, and the hub is reachable again
- **THEN** the page shows the new title with no reload

#### Scenario: The hub stays away

- **WHEN** the link ended, and the next four attempts fail
- **THEN** the delays before the attempts are 500 ms, 1 s, 2 s, and 4 s, the next delay is 5 s, and the console has one warning

#### Scenario: The model did not change

- **WHEN** the link ended and a new link gives a part `store` that is equal to the last one
- **THEN** the page does not draw again

### Requirement: The page closes its link when the person leaves

When the page gets the `pagehide` event, it SHALL close its link, SHALL NOT open a new link, and SHALL write no warning for the end of that link.

#### Scenario: A reload

- **WHEN** the person reloads the page
- **THEN** the old page writes no warning, and the hub detaches the subsystem of the old page

## REMOVED Requirements

### Requirement: The page shows its fixed content when it has no snapshot

**Reason**: The page has no snapshot. It reads the part `store` of a link, and the end of a link has its own rule.

**Migration**: See "The page shows its fixed content before the first link" and "The page connects again after the link ends".
