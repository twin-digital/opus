# wishem/architecture/diagrams Specification

## Purpose

Names each diagram of the architecture document of Wishem, so that a change to the architecture or to the data of a store must also change the diagram that shows it. The diagrams follow `docs/diagrams.md`.

## Requirements

### Requirement: The system context diagram

The architecture document SHALL hold a C4 system context diagram of Wishem, in `nodejs/wishem/docs/architecture/context-light.svg` and `context-dark.svg`. The diagram SHALL show each kind of person who uses Wishem, and each external system that Wishem connects to.

#### Scenario: A change adds an external system

- **WHEN** a change makes Wishem connect to an external system
- **THEN** the system context diagram shows the external system and the relationship

#### Scenario: A change adds a kind of person

- **WHEN** a change adds a kind of person who uses Wishem, such as an agent
- **THEN** the system context diagram shows that person and the relationship

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

#### Scenario: The clock package builds on the hub package

- **WHEN** `@thrashplay/wishem-clock` depends on `@thrashplay/wishem-hub`
- **THEN** the container diagram shows the container `clock` as a TypeScript package, and a relationship from `clock` to `hub` with the label "Builds on [import]"

#### Scenario: A change alters the protocol between two containers

- **WHEN** a change makes the page connect to the workbench process through a link on a WebSocket
- **THEN** the container diagram labels that relationship with the link and its technology

#### Scenario: A change makes a process write a store

- **WHEN** a change makes the workbench process write the model folder
- **THEN** the relationship between the process and the model folder says that the process writes it

### Requirement: The dynamic diagram of the path of a change

The architecture document SHALL hold a C4 dynamic diagram of the primary path of Wishem, in `nodejs/wishem/docs/architecture/dynamic-change-light.svg` and `dynamic-change-dark.svg`. The primary path is the path from a change to the model to a new picture. The diagram SHALL number each relationship in the order of the flow.

#### Scenario: A change adds a step to the path

- **WHEN** a change puts a container between the model folder and the page on the path of a change
- **THEN** the dynamic diagram shows the container and gives its relationships their numbers

#### Scenario: A change alters the transport of a step

- **WHEN** a change makes the workbench process send the changed parts to the page on a link
- **THEN** the step from the process to the page names what the process sends and the technology

### Requirement: The component diagram of the page

The architecture document SHALL hold a C4 component diagram of the page of the workbench, in `nodejs/wishem/docs/architecture/components-page-light.svg` and `components-page-dark.svg`. The diagram SHALL show the parts of the HTML renderer and how a view gets to the renderer.

#### Scenario: A change alters how a view gets to the renderer

- **WHEN** a change adds a part between the view files and the renderer, or removes one
- **THEN** the component diagram shows the parts and their relationships after the change

#### Scenario: A change replaces the client of the page

- **WHEN** a change replaces the part of the page that gets the model from the workbench process
- **THEN** the component diagram shows the new part, its technology, and its relationship to the process

#### Scenario: The renderer reads through a port

- **WHEN** the client of the hub gives the port of each link, and the renderer and the table of views come from `@thrashplay/wishem-renderer-react`
- **THEN** the component diagram shows that the renderer reads the part `store` through the port, and its technology lines name `renderer-react` for the renderer and the table of views

### Requirement: The entity diagram of the model folder

The architecture document SHALL hold an entity diagram of the model folder, in `nodejs/wishem/docs/architecture/entities-model-folder-light.svg` and `entities-model-folder-dark.svg`. The diagram SHALL show each entity of the model folder, its keys, and each relationship with its cardinality.

#### Scenario: A change adds an entity to the model folder

- **WHEN** a change adds a kind of record to the model folder, such as a relation between entities
- **THEN** the entity diagram shows the new entity, its keys, and its relationships

### Requirement: Each diagram is written by the render script

Each diagram of the architecture document SHALL be written by `nodejs/wishem/docs/architecture/render.mjs` from one description, with one file for the light theme and one file for the dark theme. A second run of the script SHALL change no file.

#### Scenario: The script runs two times

- **WHEN** a person runs `node nodejs/wishem/docs/architecture/render.mjs` two times
- **THEN** the second run changes no file
