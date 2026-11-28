# Spec Delta

## MODIFIED Requirements

### Requirement: The container diagram

The architecture document SHALL hold a C4 container diagram of Wishem, in `nodejs/wishem/docs/architecture/containers-light.svg` and `containers-dark.svg`. The diagram SHALL show each container of Wishem and each relationship between the containers.

#### Scenario: A change adds a container

- **WHEN** a change adds a process, a store of persisted data, or a package that other packages build on
- **THEN** the container diagram shows the new container and its relationships

#### Scenario: A change moves a relationship

- **WHEN** a change makes a container get its data from a different container
- **THEN** the container diagram shows the relationship between the new pair of containers

#### Scenario: The core package builds on the hub package

- **WHEN** `@thrashplay/wishem-core` depends on `@thrashplay/wishem-hub`
- **THEN** the container diagram shows the container `hub` as a TypeScript package, and a relationship from `core` to `hub` with the label "Builds on [import]"

#### Scenario: The host package and the page build on the hub package

- **WHEN** `@thrashplay/wishem-host-nodejs` depends on `@thrashplay/wishem-hub`, and the page imports a value of `@thrashplay/wishem-hub`
- **THEN** the container diagram shows a relationship from `host-nodejs` to `hub` and a relationship from the page to `hub`, each with the label "Builds on [import]"

#### Scenario: The page and the workbench process build on the React renderer package

- **WHEN** the page imports the renderer from `@thrashplay/wishem-renderer-react`, and the workbench process imports the generator from `@thrashplay/wishem-renderer-react/view-types`
- **THEN** the container diagram shows the container `renderer-react` as a TypeScript package, and a relationship from the page and from the workbench process to `renderer-react`, each with the label "Builds on [import]"

#### Scenario: The PixiJS process runs the PixiJS construct and serves the PixiJS page

- **WHEN** the `start` script of `@thrashplay/wishem-pixi-page` runs the PixiJS construct and its page server in one Node.js process
- **THEN** the container diagram shows the PixiJS process as a Node.js container, relationships from the designer to the PixiJS process and to the PixiJS page, and relationships from the PixiJS page to the PixiJS process with the labels "Gets page code [HTTP]" and "Connects to the hub [WebSocket link]"

#### Scenario: The PixiJS process builds on host-nodejs, the clock, core, and hub

- **WHEN** the PixiJS process imports `serveHub` of `@thrashplay/wishem-host-nodejs`, and values of `@thrashplay/wishem-clock`, `@thrashplay/wishem-core`, and `@thrashplay/wishem-hub`
- **THEN** the container diagram shows the container `clock` as a TypeScript package, a relationship from the PixiJS process to `host-nodejs` with the label "Serves the link with [import]", relationships from the PixiJS process to `clock`, to `core`, and to `hub`, and a relationship from `clock` to `hub`, each with the label "Builds on [import]"

#### Scenario: The PixiJS page builds on the PixiJS renderer, the hub, and the clock

- **WHEN** the PixiJS page imports values of `@thrashplay/wishem-renderer-pixi`, `@thrashplay/wishem-hub`, and `@thrashplay/wishem-clock`
- **THEN** the container diagram shows the PixiJS page as a container in a web browser, the container `renderer-pixi` as a TypeScript package, and a relationship from the PixiJS page to each of the three packages with the label "Builds on [import]"

#### Scenario: A change alters the protocol between two containers

- **WHEN** a change makes the page connect to the workbench process through a link on a WebSocket
- **THEN** the container diagram labels that relationship with the link and its technology

#### Scenario: A change makes a process write a store

- **WHEN** a change makes the workbench process write the model folder
- **THEN** the relationship between the process and the model folder says that the process writes it
