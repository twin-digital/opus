# Spec Delta

## REMOVED Requirements

### Requirement: The container diagram of Wishem

**Reason**: The container diagram showed each package of `nodejs/wishem/` as a container and each value import as a relationship. The owner decided in #649 that the container diagram holds runtime units only.

**Migration**: "The container diagram of the runtime units" holds each runtime unit, store, and runtime relationship. "The package dependency view" shows each package and its dependencies.

## MODIFIED Requirements

### Requirement: Each diagram is written by the render script

Each diagram of the architecture document SHALL be written by `nodejs/wishem/docs/architecture/render.mjs` from one description, with one file for the light theme and one file for the dark theme. A second run of the script SHALL change no file. With the option `--check`, the script SHALL write no file, and SHALL end with exit code 1 when a file differs from its output.

#### Scenario: The script runs two times

- **WHEN** a person runs `node nodejs/wishem/docs/architecture/render.mjs` two times
- **THEN** the second run changes no file

#### Scenario: A diagram file is out of date

- **WHEN** an SVG file of the architecture document differs from the output of the script, and a person runs `node nodejs/wishem/docs/architecture/render.mjs --check`
- **THEN** the script writes no file, prints the name of each file that differs, and ends with exit code 1

#### Scenario: Each diagram file is current

- **WHEN** each SVG file is equal to the output of the script, and a person runs the script with `--check`
- **THEN** the script ends with exit code 0

## ADDED Requirements

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

- **WHEN** the workbench process runs a product construct whose link a renderer in a different process opens
- **THEN** the table row of the workbench process says that it runs the product constructs and serves the link of each one, and the diagram shows no new process for a product construct

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

### Requirement: The package dependency view

The architecture document SHALL hold a package dependency view (not C4) of Wishem in `packages-light.svg` and `packages-dark.svg`, which `render.mjs` SHALL make from the `package.json` files of `nodejs/wishem/`. The view SHALL show each package in its layer, and one arrow for each Wishem package in the `dependencies` or `peerDependencies` of a package. A card SHALL name the Wishem packages that are only in its `devDependencies`, with no arrow.

#### Scenario: A change adds a dependency

- **WHEN** a change adds `@thrashplay/wishem-clock` to the `dependencies` of `@thrashplay/wishem-renderer-pixi`, and a person runs `render.mjs`
- **THEN** the view shows an arrow from the card of `renderer-pixi` to the card of `clock`

#### Scenario: Each runtime dependency has an arrow

- **WHEN** a person compares the arrows of the view with the `package.json` files of `nodejs/wishem/`
- **THEN** each Wishem package in the `dependencies` or `peerDependencies` of a package has exactly one arrow from that package, and the view has no other arrow

#### Scenario: A development dependency

- **WHEN** a package has a Wishem package in `devDependencies` only, as `host-nodejs` has `clock`
- **THEN** the card of the package names it in the line of the packages that it tests with, and the view shows no arrow from the package to it

#### Scenario: A peer dependency

- **WHEN** a package has a Wishem package in `peerDependencies`
- **THEN** the view shows an arrow from the card of the package to the card of the peer dependency

#### Scenario: A package with no Wishem dependency

- **WHEN** a package depends on no other package of Wishem, as `hub`
- **THEN** no arrow starts at its card

#### Scenario: The table of the packages

- **WHEN** a person reads the section of the package dependency view in the architecture document
- **THEN** a table has one row for each package, with its name, its layer, and its responsibility

### Requirement: The routes of the arrows

Each arrow of the package dependency view SHALL go down, from the bottom edge of the card of the package to the top edge of the card of the dependency. No arrow SHALL cross a card or the label of a layer. No two arrows SHALL share a line.

#### Scenario: A dependency in the same layer

- **WHEN** `@thrashplay/wishem-update` uses `@thrashplay/wishem-core`, and the two packages are in one layer
- **THEN** the card of `core` is in a lower row of the band than the card of `update`, and the arrow from `update` to `core` goes down

#### Scenario: An arrow has no free route

- **WHEN** the layout puts a line of an arrow through a card or through the label of a layer, or puts two arrows on one line
- **THEN** the script writes no file, names the arrow, and ends with an error

### Requirement: The layers of the packages

`render.mjs` SHALL hold one ordered list of layers, and each layer SHALL name its packages. Each package of `nodejs/wishem/` SHALL be in exactly one layer. A runtime dependency (`dependencies` or `peerDependencies`) SHALL go to a package in the same layer or a lower layer. The runtime dependencies in one layer SHALL make no cycle. A development dependency can go to any layer.

#### Scenario: A package has no layer

- **WHEN** a change adds a package to `nodejs/wishem/` and adds it to no layer, and a person runs `render.mjs`
- **THEN** the script writes no file, prints that the package has no layer, and ends with exit code 1

#### Scenario: A layer names a package that does not exist

- **WHEN** a layer names a package that has no folder in `nodejs/wishem/`
- **THEN** the script writes no file, prints the name of the package, and ends with exit code 1

#### Scenario: A dependency goes to a higher layer

- **WHEN** `@thrashplay/wishem-hub` gets `@thrashplay/wishem-core` in its `dependencies`, and `core` is in a higher layer than `hub`
- **THEN** the script writes no file, prints the two packages, and ends with exit code 1

#### Scenario: The runtime dependencies in one layer make a cycle

- **WHEN** two packages of one layer use each other in their `dependencies`
- **THEN** the script writes no file, prints the name of the layer, and ends with exit code 1

#### Scenario: A development dependency goes to a higher layer

- **WHEN** `@thrashplay/wishem-construct-manager` has `@thrashplay/wishem-sample-product` in `devDependencies`
- **THEN** the script accepts it, and the card of `construct-manager` names `sample-product` in the line of the packages that it tests with

### Requirement: The check of the architecture document

The tests of `@thrashplay/wishem-docs-check` SHALL run `render.mjs --check`. The check SHALL fail when an SVG file differs from the output of the script, when the layers are not correct, or when the table of the package dependency view has no row for a package. `@thrashplay/wishem-docs-check` SHALL have each other package of `nodejs/wishem/` as a development dependency, so that a change to any of them runs its tests in CI.

#### Scenario: A change alters a dependency and does not render

- **WHEN** a change adds a Wishem dependency to a `package.json` of `nodejs/wishem/` and commits no new `packages-*.svg` file
- **THEN** the tests of `@thrashplay/wishem-docs-check` fail, and the message names `packages-light.svg`

#### Scenario: The table has no row for a package

- **WHEN** the table of the package dependency view has no row for a package of `nodejs/wishem/`
- **THEN** the tests of `@thrashplay/wishem-docs-check` fail, and the message names the package

#### Scenario: A new package is not a development dependency of the check

- **WHEN** a package of `nodejs/wishem/` is not in the `devDependencies` of `@thrashplay/wishem-docs-check`
- **THEN** the tests of `@thrashplay/wishem-docs-check` fail, and the message names the package

#### Scenario: The container diagram shows a package

- **WHEN** `containers-light.svg` holds the text `TypeScript package` or `[import]`
- **THEN** the tests of `@thrashplay/wishem-docs-check` fail

#### Scenario: The architecture document is current

- **WHEN** each SVG file, the layers, and the table agree with the packages
- **THEN** the tests of `@thrashplay/wishem-docs-check` pass

### Requirement: The merge checks run the check

The merge checks of each pull request against `main` SHALL run `node nodejs/wishem/docs/architecture/render.mjs --check`, so that a change to `nodejs/wishem/docs/` alone is also checked.

#### Scenario: A pull request changes only the architecture folder

- **WHEN** a pull request changes `render.mjs` or an SVG file in `nodejs/wishem/docs/architecture/` and changes no package, and an SVG file differs from the output of the script
- **THEN** the merge checks of the pull request fail, and the log names the file

### Requirement: The component diagram of the workbench process

The architecture document SHALL hold a C4 component diagram of the workbench process, in `nodejs/wishem/docs/architecture/components-workbench-process-light.svg` and `components-workbench-process-dark.svg`. The diagram SHALL show the parts of the process, among them the construct, the construct manager, the product constructs, and the update subsystem, and their relationships to the page and to the model folders.

#### Scenario: The parts of the workbench process

- **WHEN** the `start` script of `@thrashplay/wishem-workbench-app` starts the workbench process with `--product` and `--product-code`
- **THEN** the component diagram shows the start script, the workbench construct, the storage subsystems, the construct manager, the product constructs, the update subsystem, the product code, the Vite development server, and the generator of the view types

#### Scenario: The construct manager runs the product constructs

- **WHEN** the start script attaches the construct manager to the hub of the workbench construct, and the construct manager starts a product construct for each item of the construct list
- **THEN** the component diagram shows a relationship from the construct manager to the workbench construct, and a relationship from the construct manager to the product constructs

#### Scenario: A product construct runs the behaviors

- **WHEN** each product construct runs the native behaviors of the product code in its update subsystem
- **THEN** the component diagram shows a relationship from the product constructs to the update subsystem, and from the update subsystem to the product code

#### Scenario: The page connects through the Vite development server

- **WHEN** the Vite development server serves the page code and passes the WebSocket at `/link` to the workbench construct
- **THEN** the component diagram shows the page outside the process boundary, a relationship from the page to the Vite development server, and a relationship from the Vite development server to the workbench construct

#### Scenario: A change adds a part to the workbench process

- **WHEN** a change adds a part with its own purpose to the workbench process, or removes one
- **THEN** the component diagram shows the parts and their relationships after the change
