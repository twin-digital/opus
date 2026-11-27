# Spec Delta

## MODIFIED Requirements

### Requirement: The page is one output subsystem of the hub

The page SHALL attach to the hub through a link as one output subsystem. The ID of the subsystem SHALL be `page-` and random lowercase hexadecimal digits, new for each link, so that two pages of one construct do not use one ID. The page SHALL send no input. The page SHALL give the remote port of each new link to the React renderer.

#### Scenario: Two pages

- **WHEN** a person opens the address of the page in two tabs
- **THEN** each tab shows the app bar, and each tab follows the next change of the model

#### Scenario: The record after a page connects

- **WHEN** a page opens a link and draws the model
- **THEN** the record of the hub holds no input with a source that starts with `page-`

#### Scenario: A new link

- **WHEN** the link ended, and the page opens a new link
- **THEN** the renderer draws from the remote port of the new link

## REMOVED Requirements

### Requirement: Each drawn element gives its entity

**Reason**: The mark is a job of the React renderer package. The requirement moves with its scenarios to `wishem/renderer-html/renderer`.

**Migration**: None. The page uses the renderer of the package, so each drawn element of the page still gives its entity.
