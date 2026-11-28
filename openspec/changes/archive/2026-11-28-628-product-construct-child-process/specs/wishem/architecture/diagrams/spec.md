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

- **WHEN** the `start` script of `@thrashplay/wishem-workbench` runs the `wishem` command of `@thrashplay/wishem-host-nodejs`
- **THEN** the container diagram shows the Wishem command process as a Node.js container, a relationship from the designer to it, and relationships from it to the model folder and to the product model folder with the label "Reads, watches, and writes [file system]"

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

### Requirement: The component diagram of the workbench process

The architecture document SHALL hold a C4 component diagram of the workbench process, in `nodejs/wishem/docs/architecture/components-workbench-process-light.svg` and `components-workbench-process-dark.svg`. The diagram SHALL show the parts of the process, among them the construct, the construct manager, and the launcher of the product construct processes, and their relationships to the page, to the model folders, and to the product construct processes.

#### Scenario: The parts of the workbench process

- **WHEN** the `start` script of `@thrashplay/wishem-workbench-app` starts the workbench process with `--product` and `--product-code`
- **THEN** the component diagram shows the start script, the workbench construct, the storage subsystems, the construct manager, the launcher of the product construct processes, the Vite development server, and the generator of the view types inside the process boundary, and the product construct process outside it

#### Scenario: The construct manager runs the product constructs

- **WHEN** the start script attaches the construct manager to the hub of the workbench construct, and the construct manager starts a product construct process with the launcher for each item of the construct list
- **THEN** the component diagram shows a relationship from the construct manager to the workbench construct, a relationship from the construct manager to the launcher, and a relationship from the launcher to the product construct process with the label "Starts, stops, and reaches the hub [child process, link over IPC]"

#### Scenario: A product construct runs the behaviors

- **WHEN** each product construct process loads the product code and runs its native behaviors in its update subsystem
- **THEN** the component diagram shows no update subsystem and no product code inside the process boundary, and the table of the components says that the product construct process loads the product code

#### Scenario: The start script checks the product code

- **WHEN** the start script checks the product code in a child process before the workbench construct starts
- **THEN** the component diagram shows a relationship from the start script to the launcher with the label "Checks the product code"

#### Scenario: The page connects through the Vite development server

- **WHEN** the Vite development server serves the page code and passes the WebSocket at `/link` to the workbench construct
- **THEN** the component diagram shows the page outside the process boundary, a relationship from the page to the Vite development server, and a relationship from the Vite development server to the workbench construct

#### Scenario: A change adds a part to the workbench process

- **WHEN** a change adds a part with its own purpose to the workbench process, or removes one
- **THEN** the component diagram shows the parts and their relationships after the change
