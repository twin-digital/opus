# Spec Delta

## MODIFIED Requirements

### Requirement: The page reads the construct through the link

The PixiJS page SHALL be a part of the private package `@thrashplay/wishem-pixi-page`. The page SHALL hold no hub. It SHALL open one link at `/link` on the address that served it, with one output subsystem for the renderer and one input subsystem for the keys. Each subsystem SHALL keep one ID for the life of the page, also when the link ends and the page opens a new link. The page SHALL make new IDs only after the hub refuses a `hello` with `id-in-use`. The renderer SHALL draw from the remote port of the output subsystem.

#### Scenario: The page opens

- **WHEN** the construct runs and a person opens the page
- **THEN** the page shows the canvas of PixiJS, and the color of the canvas changes two times each second

#### Scenario: The page attaches two subsystems

- **WHEN** the page opens a link
- **THEN** the `hello` of the link has one output subsystem and one input subsystem, and the hub attaches both

#### Scenario: The same IDs after a new link

- **WHEN** the link of the page ends and the page opens a new link
- **THEN** the `hello` of the new link holds the same subsystem IDs as the `hello` before

#### Scenario: New IDs after id-in-use

- **WHEN** the hub refuses a `hello` of the page with `id-in-use`
- **THEN** the page makes new subsystem IDs for the next link
