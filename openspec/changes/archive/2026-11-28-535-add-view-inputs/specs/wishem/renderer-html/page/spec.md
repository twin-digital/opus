# Spec Delta

## REMOVED Requirements

### Requirement: The page is one output subsystem of the hub

**Reason**: A view of the page can send an input. The page attaches one output subsystem and one input subsystem on its link.
**Migration**: See the requirements "The page attaches an output subsystem and an input subsystem" and "The source of the inputs of a page is the same for one load".

## ADDED Requirements

### Requirement: The page attaches an output subsystem and an input subsystem

The page SHALL open one link with two subsystems: the output subsystem `page-<hex>` and the input subsystem `page-<hex>-input`, where `<hex>` is 16 random lowercase hexadecimal digits. The page SHALL give the remote port of the output subsystem and the remote port of the input subsystem of each new link to the React renderer. The page SHALL send an input only when a view sends one.

#### Scenario: Two pages

- **WHEN** a person opens the address of the page in two tabs
- **THEN** each tab shows the app bar, each tab has its own two IDs, and each tab follows the next change of the model

#### Scenario: The record after a page connects

- **WHEN** a page opens a link and draws the model, and the person changes nothing
- **THEN** the record of the hub holds no input with a source that starts with `page-`

#### Scenario: A new link

- **WHEN** the link ended, and the page opens a new link
- **THEN** the renderer draws from the output port of the new link and sends through the input port of the new link

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
