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

#### Scenario: A change alters the protocol between two containers

- **WHEN** a change makes the page connect to the workbench process through a link on a WebSocket
- **THEN** the container diagram labels that relationship with the link and its technology

#### Scenario: A change makes a process write a store

- **WHEN** a change makes the workbench process write the model folder
- **THEN** the relationship between the process and the model folder says that the process writes it

#### Scenario: The workbench process mounts a product

- **WHEN** the workbench process keeps the model of a mounted product in a product folder
- **THEN** the container diagram shows the product model folder as a store of JSON files, a relationship from the workbench process to it with the label "Reads, watches, and writes [file system]", and a relationship from the designer to it with the label "Edits files [text editor]"

### Requirement: The entity diagram of the model folder

The architecture document SHALL hold an entity diagram of the model folder, in `nodejs/wishem/docs/architecture/entities-model-folder-light.svg` and `entities-model-folder-dark.svg`. The diagram SHALL show each entity of the model folder, its keys, and each relationship with its cardinality. The diagram SHALL apply to each model folder: the model folder of the workbench and the product folder have the same entities.

#### Scenario: A change adds an entity to the model folder

- **WHEN** a change adds a kind of record to the model folder, such as a relation between entities
- **THEN** the entity diagram shows the new entity, its keys, and its relationships

#### Scenario: A second model folder with the same schema

- **WHEN** a change adds a store of persisted data that has the layout of a model folder, such as the product folder
- **THEN** the architecture document says that the entity diagram applies to that store, and no second entity diagram exists
