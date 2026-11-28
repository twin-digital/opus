# wishem/host-nodejs/cli Specification

## Purpose

Defines the `wishem` command line, which runs a construct in a Node.js process: its commands, its options, its exit codes, and what it prints in the terminal.

## Requirements

### Requirement: One command starts a construct for a model folder

The command `wishem start <folder>` SHALL read the model folder, start one construct with that model, start the server, and print the address of the link. The command SHALL NOT need a web browser. The command SHALL run until it gets an interrupt signal, and then it SHALL stop the construct and the server and stop with exit code 0.

#### Scenario: A correct model

- **WHEN** the designer runs `wishem start ./model` and the model is correct
- **THEN** the command prints the number of component types, the number of entities, and the address of the link, and it continues to run

#### Scenario: The designer stops the command

- **WHEN** the designer sends an interrupt signal to the running command
- **THEN** the server stops and the command stops with exit code 0

#### Scenario: No folder is given

- **WHEN** the designer runs `wishem start` with no folder
- **THEN** the command prints how to use it and stops with a non-zero exit code

### Requirement: The command does not start with a model that is not correct

When the model folder does not exist or the model is not correct at the start, the command SHALL print each problem and SHALL stop with a non-zero exit code. The command SHALL NOT start the server.

#### Scenario: A problem at the start

- **WHEN** the designer runs `wishem start ./model` and `state.json` is not valid JSON
- **THEN** the command prints a problem that names `state.json`, starts no server, and stops with a non-zero exit code

### Requirement: The port can be selected

The default port SHALL be 4747. The option `--port <number>` SHALL select a different port. When the port is in use, the command SHALL print the reason and SHALL stop with a non-zero exit code.

#### Scenario: The default port

- **WHEN** the designer runs `wishem start ./model`
- **THEN** the command prints the address `ws://127.0.0.1:4747/link`

#### Scenario: A selected port

- **WHEN** the designer runs `wishem start ./model --port 5000`
- **THEN** the command prints the address `ws://127.0.0.1:5000/link`

#### Scenario: The port is in use

- **WHEN** a different process uses the port
- **THEN** the command prints that the port is in use and stops with a non-zero exit code

### Requirement: The terminal shows each problem during a run

When the model files are not correct during a run, the command SHALL print each problem, with the file that has the problem, and SHALL continue to run. When the files are correct again, the command SHALL print that the model is correct. The command SHALL print each warning.

#### Scenario: A file that is saved in part

- **WHEN** the command runs and `state.json` is saved with text that is not valid JSON
- **THEN** the terminal shows a problem that names `state.json`, and the command continues to run

#### Scenario: The file is corrected

- **WHEN** `state.json` was not correct, and a person saves a correct `state.json`
- **THEN** the terminal shows that the model is correct

#### Scenario: A warning

- **WHEN** two component types have the same label
- **THEN** the terminal shows the warning

### Requirement: The base workbench starts with one command

The package of the base workbench SHALL have a `start` script that runs `wishem start` on its model folder. The model SHALL hold one component type with the label `AppBar`, which has one string field with the label `title`, and one entity with an `AppBar` component.

#### Scenario: Start the base workbench

- **WHEN** a person runs `pnpm --filter @thrashplay/wishem-workbench start`, and a client opens a link at the printed address
- **THEN** the part `store` of the `welcome` message holds one component type with the label `AppBar` and one entity

### Requirement: The command mounts a product

The option `--product <folder>` of `wishem start` SHALL mount the model of that folder as the store `product`. The command SHALL print the absolute path of the product folder after the line of the model folder, and the counts of the product model after the counts of the model. The usage line SHALL name the option.

#### Scenario: A workbench with the sample product

- **WHEN** the designer runs `wishem start /tmp/a4-model --product /tmp/a4-product`, and the two folders are correct
- **THEN** the command prints `wishem: model /tmp/a4-model`, `wishem: product /tmp/a4-product`, `wishem: 1 component type, 1 entity`, `wishem: product: 2 component types, 1 entity`, and the address of the link, in this order

#### Scenario: The usage line

- **WHEN** the designer runs `wishem start` with no folder
- **THEN** the command prints `usage: wishem start <folder> [--product <folder>] [--port <number>]` and stops with exit code 2

### Requirement: The command does not start with a product that is not correct

When the product folder does not exist or its model is not correct at the start, the command SHALL print each problem with the absolute path of its file, SHALL start no server, and SHALL stop with a non-zero exit code. When the product folder is the model folder, the command SHALL print that the two folders are the same folder and SHALL stop with exit code 1.

#### Scenario: A product file that is not valid JSON

- **WHEN** the designer runs `wishem start /tmp/a4-model --product /tmp/a4-product`, and `/tmp/a4-product/state.json` is not valid JSON
- **THEN** the command prints `wishem: problem in /tmp/a4-product/state.json: the text is not valid JSON (line 1)` and `wishem: the model is not correct, so the hub did not start`, and stops with exit code 1

#### Scenario: The same folder

- **WHEN** the designer runs `wishem start /tmp/a4-model --product /tmp/a4-model`
- **THEN** the command prints `wishem: the product folder and the model folder are the same folder`, starts no server, and stops with exit code 1

#### Scenario: An empty value

- **WHEN** the designer runs `wishem start /tmp/a4-model --product ""`
- **THEN** the command prints the usage line and stops with exit code 2
