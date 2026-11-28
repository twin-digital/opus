# wishem/workbench/start Specification

## Purpose

Defines the one command that starts the workbench for a person: it starts the construct of the workbench and the page that draws it, prints where each one is, and stops them together.

## Requirements

### Requirement: One command starts the construct and the page

The package of the workbench page SHALL have a `start` script. The script SHALL start one construct for a model folder and SHALL serve the page of the workbench. The script SHALL print the address of the link and the address of the page. The default model folder SHALL be the model folder of the base workbench.

#### Scenario: Start the workbench

- **WHEN** a person runs `pnpm --filter @thrashplay/wishem-workbench-app start`
- **THEN** the command prints the model folder, the address of the link, and the address of the page, and a web browser that opens the address of the page shows the app bar with the title `Wishem`

#### Scenario: A different model folder

- **WHEN** a person runs the script with `--model ./my-model`
- **THEN** the page draws the model of that folder

### Requirement: The construct and the page stop together

When the command gets an interrupt signal, it SHALL stop the page server and the construct, and it SHALL stop with exit code 0. When the construct cannot start, the command SHALL NOT serve the page.

#### Scenario: The person stops the command

- **WHEN** the person sends an interrupt signal to the running command
- **THEN** the address of the page and the address of the link accept no connection, and the command stops with exit code 0

#### Scenario: The model is not correct at the start

- **WHEN** a person runs the script and `state.json` is not valid JSON
- **THEN** the command prints a problem that names `state.json`, serves no page, and stops with a non-zero exit code

### Requirement: The ports can be selected

The option `--port <number>` SHALL select the port of the page. The option `--hub-port <number>` SHALL select the port of the server of the construct. The value 0 SHALL let the system select a port, and the command SHALL print the port that the system selected. When a port is in use, the command SHALL print which port is in use, SHALL stop each part that it started, and SHALL stop with a non-zero exit code.

#### Scenario: The default ports

- **WHEN** a person runs the script with no option
- **THEN** the command prints the page address with port 5173 and the link address with port 4747

#### Scenario: The port of the page is in use

- **WHEN** a different process uses the port of the page
- **THEN** the command prints that the port is in use, the port of the hub is free again, and the command stops with a non-zero exit code

### Requirement: The page is local

The page server SHALL listen only on the loopback address `127.0.0.1`. A program on a different computer SHALL NOT be able to connect to the page or, through the page, to the link.

#### Scenario: A request from a different computer

- **WHEN** the workbench runs and a program connects to the port of the page on a network address of the computer that is not the loopback address
- **THEN** the connection is refused

### Requirement: An edit to a view shows with no restart

While the command runs, a saved change to a view file SHALL show in the open page. The person SHALL NOT need to start the command again or to reload the page by hand.

#### Scenario: A person edits the view of the app bar

- **WHEN** the workbench runs, the page is open, and a person saves a change to the view file of the app bar
- **THEN** the page shows the change

### Requirement: The page address also carries the link

The address that serves the page SHALL pass a WebSocket at the path `/link` to the server of the construct. The page server SHALL pass no other path to the server of the construct.

#### Scenario: A link through the address of the page

- **WHEN** the workbench runs and a client opens a link at `/link` of the address of the page
- **THEN** the client gets the `welcome` message of the hub, and an input that the client sends changes `state.json`

#### Scenario: A path that only starts with /link

- **WHEN** the workbench runs and a client asks for `/linkx` at the address of the page
- **THEN** the server of the construct does not get the request

### Requirement: The start script mounts a product

The option `--product <folder>` of the `start` script of the workbench page SHALL mount the model of that folder in the construct of the workbench. A relative path SHALL be relative to the folder in which the person runs the command. The script SHALL print the absolute path of the product folder after the line of the model folder. With no option, the script SHALL mount no product.

#### Scenario: Start the workbench with the sample product

- **WHEN** a person runs `pnpm --filter @thrashplay/wishem-workbench-app start --product nodejs/wishem/sample-product/model` from the root of the repository
- **THEN** the command prints `wishem: model <path>`, `wishem: product <absolute path of nodejs/wishem/sample-product/model>`, the address of the link, and the address of the page, and a client of the link at the address of the page gets a `welcome` message with the parts `store` and `product`

#### Scenario: The page with a mounted product

- **WHEN** the workbench runs with a mounted product, and a web browser opens the address of the page
- **THEN** the page shows the app bar and the product panel with the entities of the product

#### Scenario: A product that is not correct

- **WHEN** a person runs the script with `--product` and a product folder whose `state.json` is not valid JSON
- **THEN** the command prints a problem that names the absolute path of that `state.json`, serves no page, the port of the hub is free again, and the command stops with a non-zero exit code

### Requirement: The start script runs the construct manager with a mounted product

When the `start` script of the workbench page mounts a product, it SHALL add the construct list to the workbench construct and SHALL attach the construct manager. When the script stops, it SHALL stop the construct manager before the construct of the workbench. With no product, the script SHALL attach no construct manager.

#### Scenario: Start with a product

- **WHEN** a person runs the script with `--product nodejs/wishem/sample-product/model`
- **THEN** a client of the link gets a `welcome` message with the parts `store`, `product`, and `constructs`

#### Scenario: Start with no product

- **WHEN** a person runs the script with no option
- **THEN** the `welcome` message has no part `constructs`

### Requirement: The option --product-code names the rules of the product

The option `--product-code <module>` SHALL name a module whose export `behaviors` is the list of native behaviors of a product construct. The value SHALL be a package name or a path, and a path SHALL be relative to the folder in which the person runs the command. The script SHALL print the line `wishem: product code <value>` after the line of the product folder. With no option, a product construct SHALL have the update subsystem with no behavior.

#### Scenario: The rules of the sample product

- **WHEN** a person runs the script with `--product nodejs/wishem/sample-product/model --product-code @thrashplay/wishem-sample-product` from the root of the repository
- **THEN** the command prints `wishem: product code @thrashplay/wishem-sample-product` after the line of the product folder, and the count of a product construct advances with its clock

#### Scenario: A module that cannot be loaded

- **WHEN** a person runs the script with `--product-code ./missing.ts`
- **THEN** the command prints a line that names `./missing.ts` and the reason, serves no page, the port of the hub is free again, and the command stops with a non-zero exit code

#### Scenario: A module with no wrapStore

- **WHEN** a person runs the script with `--product-code` and a module that exports the function `wrapStore` and no `behaviors`
- **THEN** the command prints `wishem: the product code has no correct list behaviors:` and the reason, serves no page, and stops with a non-zero exit code

#### Scenario: A list that is not correct

- **WHEN** a person runs the script with `--product-code` and a module whose `behaviors` is the text `count`
- **THEN** the command prints `wishem: the product code has no correct list behaviors: The behaviors are not a list.`, serves no page, and stops with a non-zero exit code

#### Scenario: Product code with no product

- **WHEN** a person runs the script with `--product-code` and no `--product`
- **THEN** the command prints `wishem: --product-code needs --product`, serves no page, and stops with a non-zero exit code
