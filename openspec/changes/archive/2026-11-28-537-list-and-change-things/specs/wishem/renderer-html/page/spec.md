# Spec Delta

## MODIFIED Requirements

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

### Requirement: The page meets the accessibility rules of the style guide

The page SHALL pass the same accessibility checks as the style guide of the workbench, in light mode and in dark mode.

#### Scenario: The base workbench in each theme

- **WHEN** the page shows the app bar and the zero state, in light mode and in dark mode
- **THEN** the accessibility check finds no violation

#### Scenario: The page with a mounted product in each theme

- **WHEN** the page shows the app bar and the product panel with the sample entity selected, in light mode and in dark mode
- **THEN** the accessibility check finds no violation
