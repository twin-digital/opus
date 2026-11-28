# Spec Delta

## MODIFIED Requirements

### Requirement: The container diagram of the runtime units

The architecture document SHALL hold a C4 container diagram of Wishem, in `nodejs/wishem/docs/architecture/containers-light.svg` and `containers-dark.svg`. The diagram SHALL show each runtime unit of Wishem (each process, page, and application), each store of persisted data, and each runtime relationship between them. No library package SHALL be a container. Each card SHALL name the package that holds the unit.

#### Scenario: A change adds a runtime unit

- **WHEN** a change adds a process, a page, an application, or a store of persisted data
- **THEN** the container diagram shows the new container and its runtime relationships

#### Scenario: A change adds a library package

- **WHEN** a change adds a package that other packages depend on, and the package runs only inside other containers
- **THEN** the container diagram does not show the package, and the package dependency view shows it

#### Scenario: A change moves a relationship

- **WHEN** a change makes a container get its data from a different container
- **THEN** the container diagram shows the relationship between the new pair of containers

#### Scenario: A relationship is an import

- **WHEN** a container imports a value of a package of Wishem
- **THEN** the container diagram shows no relationship for the import, and the row of the container in the table names the package

#### Scenario: The table names the packages of a container

- **WHEN** the code of a package runs in a container, as `construct-manager` runs in the workbench process
- **THEN** the row of the container in the table of the containers names the package

#### Scenario: A change alters the protocol between two containers

- **WHEN** a change makes the page connect to the workbench process through a link on a WebSocket
- **THEN** the container diagram labels that relationship with the link and its technology

#### Scenario: A change makes a process write a store

- **WHEN** a change makes the workbench process write the model folder
- **THEN** the relationship between the process and the model folder says that the process writes it

#### Scenario: The workbench process mounts a product

- **WHEN** the workbench process keeps the model of a mounted product in a product folder
- **THEN** the container diagram shows the product model folder as a store of JSON files, a relationship from the workbench process to it with the label "Reads, watches, and writes [file system]", and a relationship from the designer to it with the label "Edits files [text editor]"

#### Scenario: A product construct serves its link from the workbench process

- **WHEN** a renderer in a different process opens the link of a product construct at `/constructs/<id>/link` of the address of the page
- **THEN** the container diagram shows that the workbench process passes the link to the product construct process

#### Scenario: A product construct runs in a process of its own

- **WHEN** the construct manager of the workbench process starts each product construct in a Node.js child process, and reaches its hub through a link on the IPC channel
- **THEN** the container diagram shows the product construct process as a Node.js container, a relationship from the workbench process to it with the label "Starts, stops, and reaches the hub [child process, link over IPC]", and a relationship from the workbench process to it with the label "Passes the links of the product constructs [WebSocket]", and the table row of the workbench process does not say that it runs the product constructs

#### Scenario: The wishem command runs a construct with no page

- **WHEN** the `start` script of `@thrashplay/wishem-workbench` runs the `wishem` command of `@thrashplay/wishem-command`
- **THEN** the container diagram shows the Wishem command process as a Node.js container, a relationship from the designer to it, and relationships from it to the model folder and to the product model folder with the label "Reads, watches, and writes [file system]", and the row of the Wishem command process in the table names the package `command` (bin `wishem`)

#### Scenario: The wishem command runs the product constructs

- **WHEN** the `wishem` command runs with `--product`, and its construct manager starts each product construct in a product construct process
- **THEN** the container diagram shows a relationship from the Wishem command process to the product construct process with the label "Starts, stops, and reaches the hub [child process, link over IPC]", and the row of the Wishem command process names the packages `construct-manager` and `host-nodejs`

#### Scenario: The PixiJS process serves the PixiJS page

- **WHEN** the `start` script of `@thrashplay/wishem-pixi-page` runs only the page server of the PixiJS page, and passes the WebSocket at `/link` to the sample construct process
- **THEN** the container diagram shows the PixiJS process as a Node.js container, relationships from the designer to the PixiJS process and to the PixiJS page, relationships from the PixiJS page to the PixiJS process with the labels "Gets page code [HTTP]" and "Connects to the hub [WebSocket link]", and a relationship from the PixiJS process to the sample construct process with the label "Passes the link [WebSocket]"

#### Scenario: The sample construct process runs the sample product

- **WHEN** the `construct` script of `@thrashplay/wishem-three-renderers` runs the sample construct in a Node.js process
- **THEN** the container diagram shows the sample construct process as a Node.js container, a relationship from the designer to it, and a relationship from it to the product model folder with the label "Reads [file system]"

#### Scenario: The React page draws the sample construct

- **WHEN** the `react-page` script of `@thrashplay/wishem-three-renderers` runs the page server of the React page
- **THEN** the container diagram shows the React page server as a Node.js container and the React page as a container in a web browser, relationships from the designer to both, relationships from the React page to the React page server with the labels "Gets page code [HTTP]" and "Connects to the hub [WebSocket link]", and a relationship from the React page server to the sample construct process with the label "Passes the link [WebSocket]"

#### Scenario: The Godot application connects to the sample construct through the Godot runner

- **WHEN** the `godot` script of `@thrashplay/wishem-renderer-godot` starts the Godot application in Docker and carries the bytes of its link to the sample construct process
- **THEN** the container diagram shows the Godot runner as a Node.js container and the Godot application as a Godot container, a relationship from the designer to the Godot runner, a relationship from the Godot runner to the Godot application with the label "Starts and copies the screenshots [Docker]", a relationship from the Godot application to the Godot runner with the label "Connects to the hub [WebSocket link]", and a relationship from the Godot runner to the sample construct process with the label "Carries the link [TCP]"
