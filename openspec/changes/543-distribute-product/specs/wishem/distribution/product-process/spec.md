# Spec Delta

## Purpose

Defines the product process: the command `node run.mjs` of a product build, which runs the product construct with its hub in Node.js and serves the page and the link of the hub on one local port for the end user.

## ADDED Requirements

### Requirement: One command runs the product

The command `node run.mjs` in a product build SHALL read and check `model/`, start the product construct with the product code and a clock with the step of `product.json`, and serve the link at `/link`. With a page, it SHALL serve the files of `page/` on the same port. It SHALL print the name of the product, the counts of the model, the address of the page (with a page), and the address of the link. The time SHALL run from the start.

#### Scenario: The sample product

- **WHEN** the end user runs `node run.mjs` in a build of the sample product with a page
- **THEN** the terminal shows `wishem: product sample-product`, `wishem: 2 component types, 1 entity`, `wishem: page at http://127.0.0.1:4770/`, and `wishem: link at ws://127.0.0.1:4770/link`

#### Scenario: A build with no page

- **WHEN** the end user runs `node run.mjs` in a build with no `page/` folder
- **THEN** the terminal shows no line of a page, and a request to `/` gets status 404

### Requirement: The time of the product can start paused

With `--paused`, the part `time` SHALL start with `running` false, and the process SHALL print `wishem: the time of the product starts paused`. A client of the link can then advance the time with `time/advance`.

#### Scenario: A paused start

- **WHEN** the end user runs `node run.mjs --paused` and no input arrives for 1500 milliseconds
- **THEN** the part `time` holds 0 ticks

### Requirement: The hub of the product runs in the product process

The hub, the subsystems, and the clock of the product construct SHALL run in the product process. Each renderer SHALL reach the hub through the link. A client of the link SHALL get `welcome` with the parts `time` and `store`.

#### Scenario: A client of the link

- **WHEN** a client opens the link of a running product process with one output subsystem
- **THEN** it gets `welcome` with the parts `time` and `store`, and an `applied` event after each tick

### Requirement: The product process is local and has one port

The product process SHALL listen only on `127.0.0.1`. The default port SHALL be 4770. The option `--port <number>` SHALL select a different port, and `--port 0` SHALL let the system select one. When the port is in use, the process SHALL print `wishem: port <port> is in use` and end with exit code 1.

#### Scenario: Port 0

- **WHEN** the end user runs `node run.mjs --port 0`
- **THEN** the address of the page and of the link have the same port, which is not 0

#### Scenario: The port is in use

- **WHEN** a different program listens on port 4770 and the end user runs `node run.mjs`
- **THEN** the terminal shows `wishem: port 4770 is in use`, and the process ends with exit code 1

### Requirement: The product process serves only the files of the page

For a `GET` request, the product process SHALL send the file of `page/` that the path names, with the content type of its extension, and `page/index.html` for `/`. Each other request that does not open the link SHALL get status 404. A path that leaves `page/` SHALL get status 404.

#### Scenario: A path that leaves the page folder

- **WHEN** a client asks for `/../model/state.json` or `/%2e%2e/run.mjs`
- **THEN** the response has status 404

#### Scenario: A file of the page

- **WHEN** a client asks for `/`
- **THEN** the response has status 200, the content type `text/html`, and the content of `page/index.html`

### Requirement: The product process reads the model of the build at each start

The product process SHALL read `model/` at its start and SHALL write no file. When the model is not correct, it SHALL print each problem, start no server, and end with exit code 1.

#### Scenario: The end user edits the model and starts again

- **WHEN** the end user stops the process, sets the color of the sample entity in `model/state.json` to `#15803d`, and starts the process with `--paused`
- **THEN** the first picture has the color `#15803d`

#### Scenario: A model that is not correct

- **WHEN** `model/state.json` is not valid JSON
- **THEN** the process prints a problem that names `state.json`, starts no server, and ends with exit code 1

### Requirement: The product process stops cleanly

On `SIGINT` or `SIGTERM`, also when the signal arrives during the start, the product process SHALL stop the Godot application that it started, stop the clock and the hub, close each link, release the port, and end with exit code 0.

#### Scenario: Ctrl+C

- **WHEN** the product process runs with an open link and the end user presses Ctrl+C
- **THEN** the client gets the `stopping` event, the process ends with exit code 0, and the port is free

#### Scenario: A signal during the start

- **WHEN** the process gets `SIGTERM` before its first line of the link
- **THEN** the process ends with exit code 0 and leaves no listening port

### Requirement: The product process can start the Godot application

With `--godot <path>`, the product process SHALL start the program at `<path>` with the pack `godot/product.pck` and the address of its link, and SHALL pass each argument after `--` to it. It SHALL show each line of the application. When the application ends, the product process SHALL stop and end with exit code 0. A build with no pack SHALL refuse `--godot` with exit code 2.

#### Scenario: Godot draws the sample product

- **WHEN** the end user runs `node run.mjs --godot godot` in a build of the sample product with a Godot pack, on a computer with a display
- **THEN** the terminal shows `wishem-godot: connected (link 1)` and a line `wishem-godot: picture 1 seq <seq> color <color>`

#### Scenario: A build with no pack

- **WHEN** the end user runs `node run.mjs --godot godot` in a build with no `godot/` folder
- **THEN** the terminal shows `wishem: this build has no Godot application`, and the process ends with exit code 2

#### Scenario: The end user closes Godot

- **WHEN** the Godot application ends while the product process runs
- **THEN** the terminal shows `wishem: the Godot application ended (exit code <code>)`, and the product process stops and ends with exit code 0

### Requirement: The product process needs Node.js 24

When the version of Node.js is lower than 24, `run.mjs` SHALL print `wishem: this product needs Node.js 24 or later` and end with exit code 1.

#### Scenario: An old Node.js

- **WHEN** the end user runs `node run.mjs` with Node.js 22
- **THEN** the terminal shows `wishem: this product needs Node.js 24 or later`, and the process ends with exit code 1
