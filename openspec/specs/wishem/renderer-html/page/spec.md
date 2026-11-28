# wishem/renderer-html/page Specification

## Purpose

Defines the page of the HTML renderer: what it draws from the part `store` that it reads through a link, how the picture follows each change to the model, how an element on the screen gives its entity, what the page shows before the first link, and how the page connects again after a link ends.

## Requirements

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

### Requirement: The zero state is fixed content of the page

The page SHALL show the zero state of the component catalog in the space that the pictures of the views do not use, when the joined state has no part `product`. When the joined state has the part `product`, the page SHALL show the product panel in that space, and no zero state of the page. The zero state SHALL NOT come from the model.

#### Scenario: The app bar and the zero state

- **WHEN** the model has one entity with an `AppBar` component
- **THEN** the page shows the app bar at the top and the zero state in the space below it

#### Scenario: The model has no entity

- **WHEN** the authored state has no entity
- **THEN** the zero state uses the full page

#### Scenario: A mounted product

- **WHEN** the joined state has the parts `store` and `product`
- **THEN** the page shows the app bar at the top and the product panel in the space below it, and no zero state of the page

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

### Requirement: The page meets the accessibility rules of the style guide

The page SHALL pass the same accessibility checks as the style guide of the workbench, in light mode and in dark mode.

#### Scenario: The base workbench in each theme

- **WHEN** the page shows the app bar and the zero state, in light mode and in dark mode
- **THEN** the accessibility check finds no violation

#### Scenario: The page with a mounted product in each theme

- **WHEN** the page shows the app bar and the product panel with the sample entity selected, in light mode and in dark mode
- **THEN** the accessibility check finds no violation

### Requirement: The page shows its fixed content before the first link

Before the first `welcome` message arrives, the page SHALL show its fixed content and no view. While the hub is not reachable, the page SHALL write one warning to the browser console and SHALL try again with no action of the person.

#### Scenario: The hub is not reachable when the page loads

- **WHEN** a web browser opens the page and the hub does not answer
- **THEN** the page shows the zero state and no app bar, and the browser console has one message that the hub is not reachable

#### Scenario: The hub starts later

- **WHEN** the page loaded while the hub was not reachable, and then the hub starts
- **THEN** the page shows the app bar with no reload

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
- **THEN** the page draws one time, and the picture does not change

### Requirement: The page closes its link when the person leaves

When the page gets the `pagehide` event, it SHALL close its link, SHALL NOT open a new link, and SHALL write no warning for the end of that link.

#### Scenario: A reload

- **WHEN** the person reloads the page
- **THEN** the old page writes no warning, and the hub detaches the subsystem of the old page

### Requirement: A page that the browser restores loads again

A browser can keep a page that the person left and show it again without a load. When the page gets a `pageshow` event whose `persisted` is `true`, the page SHALL load itself again, so that it opens a new link. A `pageshow` event whose `persisted` is `false` SHALL have no effect.

#### Scenario: The person goes back to the page

- **WHEN** the person leaves the page, and the browser restores the page with a `pageshow` event whose `persisted` is `true`
- **THEN** the page loads itself again

#### Scenario: The first load

- **WHEN** the page gets a `pageshow` event whose `persisted` is `false`
- **THEN** the page does not load itself again

### Requirement: The page attaches an output subsystem and an input subsystem

The page SHALL open one link with two subsystems: the output subsystem `page-<hex>` and the input subsystem `page-<hex>-input`, where `<hex>` is 16 random lowercase hexadecimal digits. The page SHALL give the remote port of the output subsystem and the remote port of the input subsystem of each new link to the React renderer and to the product panel. The page SHALL send an input only when a view or the product panel sends one.

#### Scenario: Two pages

- **WHEN** a person opens the address of the page in two tabs
- **THEN** each tab shows the app bar, each tab has its own two IDs, and each tab follows the next change of the model

#### Scenario: The record after a page connects

- **WHEN** a page opens a link and draws the model, and the person changes nothing
- **THEN** the record of the hub holds no input with a source that starts with `page-`

#### Scenario: A new link

- **WHEN** the link ended, and the page opens a new link
- **THEN** the renderer draws from the output port of the new link and sends through the input port of the new link

#### Scenario: The product panel after a new link

- **WHEN** the link ended, the page opens a new link, and the designer commits a value in the product panel
- **THEN** the product panel sends the input through the input port of the new link, with the same source as before the new link

### Requirement: The source of the inputs of a page is the same for one load

The page SHALL make `<hex>` one time when it loads, and SHALL use the same two IDs for each link that it opens. When the hub side refuses a `hello` with the reason `id-in-use`, the page SHALL make a new `<hex>` and SHALL use it for the next attempt and each later link.

#### Scenario: Two edits across a new link

- **WHEN** the person changes the title, the process stops and starts, the page opens a new link, and the person changes the title again
- **THEN** the two `store/set-field` inputs have the same source

#### Scenario: The ID is in use

- **WHEN** the hub side refuses the `hello` of the page with the reason `id-in-use`
- **THEN** the next `hello` of the page has two IDs with a new `<hex>`, and the page writes one error to the browser console

#### Scenario: A reload

- **WHEN** the person reloads the page
- **THEN** the new page has a new `<hex>`

### Requirement: The designer changes the title in the page

The app bar of the page SHALL send `store/set-field` for its title when the designer commits a new title. The storage subsystem SHALL write the new title to `state.json`. When the hub does not accept the input, the app bar SHALL show that the title is not saved and the reason, and SHALL keep the text of the designer.

#### Scenario: A new title

- **WHEN** the designer selects the title, types `Wishem studio`, and presses Enter
- **THEN** the app bar shows `wishem studio.`, `state.json` holds `Wishem studio`, and the record holds one `store/set-field` input whose source ends with `-input`

#### Scenario: A hand edit after a change in the page

- **WHEN** the designer changes the title in the page, and then a person changes the title in `state.json` to `Hand edit`
- **THEN** the app bar shows `hand edit.`

#### Scenario: The process does not run

- **WHEN** the process stopped, and the designer commits a new title
- **THEN** the app bar shows that the title is not saved, because the workbench does not run, and the field keeps the new title

#### Scenario: A rewind after a change in the page

- **WHEN** the designer changes the title in the page, and then an input subsystem sends `hub/rewind` with the sequence number before that input
- **THEN** the app bar shows the title before the change, and `state.json` holds it
