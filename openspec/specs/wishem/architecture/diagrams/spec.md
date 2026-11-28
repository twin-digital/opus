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

#### Scenario: A view sends an input

- **WHEN** a view sends an input through the prop `wishem`, and the renderer sends it through the input port that the client of the hub gives
- **THEN** the component diagram shows a relationship from the views to the renderer with the label "Send inputs [wishem]", and the relationship from the renderer to the client of the hub says that the renderer reads and sends through the ports

#### Scenario: A tool of the page reads a different part

- **WHEN** the product panel reads the part `product` through the output port and sends `product/set-field` through the input port
- **THEN** the component diagram shows the product panel as a component with its relationship to the client of the hub, and its relationship to the catalog

### Requirement: The entity diagram of the model folder

The architecture document SHALL hold an entity diagram of the model folder, in `nodejs/wishem/docs/architecture/entities-model-folder-light.svg` and `entities-model-folder-dark.svg`. The diagram SHALL show each entity of the model folder, its keys, and each relationship with its cardinality. The diagram SHALL apply to each model folder: the model folder of the workbench and the product folder have the same entities.

#### Scenario: A change adds an entity to the model folder

- **WHEN** a change adds a kind of record to the model folder, such as a relation between entities
- **THEN** the entity diagram shows the new entity, its keys, and its relationships

#### Scenario: A second model folder with the same schema

- **WHEN** a change adds a store of persisted data that has the layout of a model folder, such as the product folder
- **THEN** the architecture document says that the entity diagram applies to that store, and no second entity diagram exists

#### Scenario: A field value refers to an entity

- **WHEN** a field of the type `reference` holds the ID of an entity
- **THEN** the entity diagram shows a relationship from `FieldValue` to `Entity` with the label "Refers to", with the mark "zero or one" at `Entity`, and the mark "zero or more" at `FieldValue`, and the legend explains the mark "zero or one"

### Requirement: Each diagram is written by the render script

Each diagram of the architecture document SHALL be written by `nodejs/wishem/docs/architecture/render.mjs` from one description, with one file for the light theme and one file for the dark theme. A second run of the script SHALL change no file.

#### Scenario: The script runs two times

- **WHEN** a person runs `node nodejs/wishem/docs/architecture/render.mjs` two times
- **THEN** the second run changes no file

### Requirement: The container diagram of Wishem

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

#### Scenario: The React renderer package builds on the hub package

- **WHEN** `@thrashplay/wishem-renderer-react` imports the value `LinkClosedError` of `@thrashplay/wishem-hub`
- **THEN** the container diagram shows a relationship from `renderer-react` to `hub` with the label "Builds on [import]"

#### Scenario: The clock package builds on the hub package

- **WHEN** `@thrashplay/wishem-clock` depends on `@thrashplay/wishem-hub`
- **THEN** the container diagram shows the container `clock` as a TypeScript package, and a relationship from `clock` to `hub` with the label "Builds on [import]"

#### Scenario: A change alters the protocol between two containers

- **WHEN** a change makes the page connect to the workbench process through a link on a WebSocket
- **THEN** the container diagram labels that relationship with the link and its technology

#### Scenario: A change makes a process write a store

- **WHEN** a change makes the workbench process write the model folder
- **THEN** the relationship between the process and the model folder says that the process writes it

#### Scenario: The workbench process mounts a product

- **WHEN** the workbench process keeps the model of a mounted product in a product folder
- **THEN** the container diagram shows the product model folder as a store of JSON files, a relationship from the workbench process to it with the label "Reads, watches, and writes [file system]", and a relationship from the designer to it with the label "Edits files [text editor]"

#### Scenario: The PixiJS process serves the PixiJS page and holds no construct

- **WHEN** the `start` script of `@thrashplay/wishem-pixi-page` runs only the page server of the PixiJS page, and passes the WebSocket at `/link` to the sample construct process
- **THEN** the container diagram shows the PixiJS process as a Node.js container, relationships from the designer to the PixiJS process and to the PixiJS page, relationships from the PixiJS page to the PixiJS process with the labels "Gets page code [HTTP]" and "Connects to the hub [WebSocket link]", a relationship from the PixiJS process to the sample construct process with the label "Passes the link [WebSocket]", and no relationship from the PixiJS process to a package of Wishem

#### Scenario: The update package builds on core, hub, and the clock

- **WHEN** `@thrashplay/wishem-update` imports values of `@thrashplay/wishem-core`, `@thrashplay/wishem-hub`, and `@thrashplay/wishem-clock`
- **THEN** the container diagram shows the container `update` as a TypeScript package, and relationships from `update` to `core`, to `hub`, and to `clock`, each with the label "Builds on [import]"

#### Scenario: The PixiJS page builds on the PixiJS renderer, the hub, and the clock

- **WHEN** the PixiJS page imports values of `@thrashplay/wishem-renderer-pixi`, `@thrashplay/wishem-hub`, and `@thrashplay/wishem-clock`
- **THEN** the container diagram shows the PixiJS page as a container in a web browser, the container `renderer-pixi` as a TypeScript package, and a relationship from the PixiJS page to each of the three packages with the label "Builds on [import]"

#### Scenario: The workbench process runs product constructs with the construct manager

- **WHEN** the workbench process imports values of `@thrashplay/wishem-construct-manager`, and that package imports values of `@thrashplay/wishem-core`, `@thrashplay/wishem-hub`, `@thrashplay/wishem-clock`, and `serveHub` of `@thrashplay/wishem-host-nodejs`
- **THEN** the container diagram shows the container `construct-manager` as a TypeScript package, a relationship from the workbench process to it with the label "Runs the product constructs with [import]", and relationships from `construct-manager` to `core`, `hub`, `clock`, and `host-nodejs`, each with the label "Builds on [import]"

#### Scenario: The workbench process loads the code of the product

- **WHEN** the workbench process loads the module that `--product-code` names, such as `@thrashplay/wishem-sample-product`
- **THEN** the container diagram shows a relationship from the workbench process to `sample-product` with the label "Loads the product code [dynamic import]"

#### Scenario: A product construct serves its link from the workbench process

- **WHEN** the workbench process runs a product construct whose link a renderer in a different process opens
- **THEN** the table row of the workbench process says that it runs the product constructs and serves the link of each one, and the diagram shows no new process for a product construct

#### Scenario: The construct manager and the workbench process build on the update package

- **WHEN** `@thrashplay/wishem-construct-manager` imports `createUpdate`, and the workbench process imports `checkBehaviors`, each of `@thrashplay/wishem-update`
- **THEN** the container diagram shows a relationship from `construct-manager` to `update` with the label "Runs the behaviors with [import]", and a relationship from the workbench process to `update` with the label "Checks the product code with [import]"

#### Scenario: The sample product imports only types of the update package

- **WHEN** `@thrashplay/wishem-sample-product` imports only types of `@thrashplay/wishem-update`
- **THEN** the container diagram shows no relationship from `sample-product` to `update`, and the dependency list of the architecture document names the dependency

#### Scenario: The sample construct process runs the sample product

- **WHEN** the `construct` script of `@thrashplay/wishem-three-renderers` runs the sample construct in a Node.js process with `startProductConstruct` of `@thrashplay/wishem-construct-manager`, the behaviors of `@thrashplay/wishem-sample-product`, and `readModelFolder` of `@thrashplay/wishem-host-nodejs`
- **THEN** the container diagram shows the sample construct process as a Node.js container, a relationship from the designer to it, a relationship from it to `construct-manager` with the label "Runs the sample construct with [import]", a relationship from it to `sample-product` with the label "Runs the behaviors of [import]", a relationship from it to `host-nodejs` with the label "Builds on [import]", and a relationship from it to the product model folder with the label "Reads [file system]"

#### Scenario: The React page draws the sample construct

- **WHEN** the `react-page` script of `@thrashplay/wishem-three-renderers` runs the page server of the React page, and the React page imports values of `@thrashplay/wishem-renderer-react` and `@thrashplay/wishem-hub`
- **THEN** the container diagram shows the React page server as a Node.js container and the React page as a container in a web browser, relationships from the designer to both, relationships from the React page to the React page server with the labels "Gets page code [HTTP]" and "Connects to the hub [WebSocket link]", a relationship from the React page server to the sample construct process with the label "Passes the link [WebSocket]", and relationships from the React page to `renderer-react` and to `hub`, each with the label "Builds on [import]"

#### Scenario: The Godot application connects to the sample construct through the Godot runner

- **WHEN** the `godot` script of `@thrashplay/wishem-renderer-godot` starts the Godot application in Docker and carries the bytes of its link to the sample construct process
- **THEN** the container diagram shows the Godot runner as a Node.js container and the Godot application as a Godot container, a relationship from the designer to the Godot runner, a relationship from the Godot runner to the Godot application with the label "Starts and copies the screenshots [Docker]", a relationship from the Godot application to the Godot runner with the label "Connects to the hub [WebSocket link]", a relationship from the Godot runner to the sample construct process with the label "Carries the link [TCP]", and no Godot process
