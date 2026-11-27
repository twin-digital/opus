# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: One command starts a core for a model folder`
- TO: `### Requirement: One command starts a construct for a model folder`

## MODIFIED Requirements

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

### Requirement: The base workbench starts with one command

The package of the base workbench SHALL have a `start` script that runs `wishem start` on its model folder. The model SHALL hold one component type with the label `AppBar`, which has one string field with the label `title`, and one entity with an `AppBar` component.

#### Scenario: Start the base workbench

- **WHEN** a person runs `pnpm --filter @thrashplay/wishem-workbench start`, and a client opens a link at the printed address
- **THEN** the part `store` of the `welcome` message holds one component type with the label `AppBar` and one entity
