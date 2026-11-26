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

### Requirement: The dynamic diagram of the path of a change

The architecture document SHALL hold a C4 dynamic diagram of the primary path of Wishem, in `nodejs/wishem/docs/architecture/dynamic-change-light.svg` and `dynamic-change-dark.svg`. The primary path is the path from a change to the model to a new picture. The diagram SHALL number each relationship in the order of the flow.

#### Scenario: A change adds a step to the path

- **WHEN** a change puts a container between the model folder and the page on the path of a change
- **THEN** the dynamic diagram shows the container and gives its relationships their numbers

### Requirement: The component diagram of the page

The architecture document SHALL hold a C4 component diagram of the page of the workbench, in `nodejs/wishem/docs/architecture/components-page-light.svg` and `components-page-dark.svg`. The diagram SHALL show the parts of the HTML renderer and how a view gets to the renderer.

#### Scenario: A change alters how a view gets to the renderer

- **WHEN** a change adds a part between the view files and the renderer, or removes one
- **THEN** the component diagram shows the parts and their relationships after the change

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
