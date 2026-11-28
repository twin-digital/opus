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
- **THEN** the command prints `usage: wishem start <folder> [--product <folder>] [--product-code <module>] [--port <number>]` and stops with exit code 2

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

### Requirement: The command runs the product constructs of the construct list

With `--product`, the construct of `wishem start` SHALL hold the construct list as the part `constructs`, and the command SHALL attach the construct manager to its hub. Each requirement of `wishem/workbench/construct-list` and `wishem/workbench/construct-manager` SHALL apply to the command as to the workbench. The command SHALL print each line of the construct manager. With no `--product`, the joined state SHALL have no part `constructs`.

#### Scenario: A start through the link of the command

- **WHEN** the command runs with `--product`, and a client of its link sends `constructs/start` for `play`
- **THEN** the terminal shows `wishem: construct play runs in the process <pid>` and `wishem: construct play runs, link at ws://127.0.0.1:<port>/link`, the entry `play` of the part `constructs` has the status `running` and that address, and a client of that address gets a `welcome` with the parts `time` and `store`

#### Scenario: A pause, a step, and a step back through the link of the command

- **WHEN** `play` runs, and a client of the link of the command sends `constructs/send` with `time/set-running` `false`, then `constructs/send` with `time/advance`, then `constructs/rewind` with 1 tick
- **THEN** the part `time` of `play` has `running` `false` and the tick count from before the step

#### Scenario: A hand edit of the product folder reaches a product construct

- **WHEN** `play` runs, and a person saves the `state.json` of the product folder with a new color
- **THEN** the store of `play` has the new color, and the store `product` of the command has the new color

#### Scenario: No product

- **WHEN** the designer runs `wishem start ./model` with no `--product`, and a client sends `constructs/start`
- **THEN** the `welcome` of the link has no part `constructs`, and the input is refused

### Requirement: The command loads the product code in each product construct

The option `--product-code <module>` SHALL name the product code: a path that starts with `.` or `/`, relative to the folder of the command process, or a package name. The command SHALL print `wishem: product code <value>` after the line of the product folder. Each product construct process SHALL load the module at its start. The command process SHALL NOT load it.

#### Scenario: The behaviors run in a product construct

- **WHEN** the designer runs `wishem start ./model --product ./product --product-code @thrashplay/wishem-sample-product`, and a client sends `constructs/start` for `play`
- **THEN** the count of `play` grows at each tick

#### Scenario: The command process does not load the module

- **WHEN** the command runs with `--product-code` and a module that writes the ID of its process to a file when it loads, and a client starts `play`
- **THEN** after the line of the link, the file holds one process ID that is not the ID of the command process, and after the start of `play`, the last line of the file is the process ID of `play`

#### Scenario: A new version of the code after a stop and a start

- **WHEN** `play` runs, a person changes the module, and a client sends `constructs/stop` and then `constructs/start` for `play`
- **THEN** `play` runs in a new process and runs the new behaviors

#### Scenario: No product code

- **WHEN** the command runs with `--product` and no `--product-code`, and a client starts `play`
- **THEN** `play` runs with no behaviors, and its count does not change

### Requirement: The command does not start with product code that cannot be used

When the product code cannot be used, the command SHALL print the reason, SHALL start no server, and SHALL stop with a non-zero exit code. The check SHALL run in a child process, and it SHALL fail when it gives no answer in 5 seconds.

#### Scenario: No product folder

- **WHEN** the designer runs `wishem start ./model --product-code ./code.mjs`
- **THEN** the command prints `wishem: --product-code needs --product` and the usage line, and stops with exit code 2

#### Scenario: An empty value

- **WHEN** the designer runs `wishem start ./model --product ./product --product-code ""`
- **THEN** the command prints the usage line and stops with exit code 2

#### Scenario: A module that cannot be loaded

- **WHEN** the designer runs the command with `--product-code ./missing.mjs`, and the file does not exist
- **THEN** the command prints `wishem: the product code ./missing.mjs cannot be loaded: <reason>` and stops with exit code 1

#### Scenario: A module with no correct list of behaviors

- **WHEN** the module of `--product-code` exports `behaviors` as the text `count`
- **THEN** the command prints `wishem: the product code has no correct list behaviors: The behaviors are not a list.` and stops with exit code 1

#### Scenario: A module that does not end at the check

- **WHEN** the module of `--product-code` does not end when it loads
- **THEN** at most 7 seconds later the command prints `wishem: the product code <value> cannot be loaded: The check did not end in 5 seconds.`, starts no server, stops with exit code 1, and no child process stays

### Requirement: A fault of a product construct does not stop the command

When a product construct process ends or does not answer, the command SHALL continue to run and SHALL serve its link. The construct manager SHALL report the status `failed` with the message.

#### Scenario: A behavior ends its process

- **WHEN** a behavior of `play` calls `process.exit(3)`
- **THEN** the terminal shows `wishem: construct play failed: The process of the construct ended with the exit code 3.`, the entry `play` has the status `failed`, a new client of the link of the command gets a `welcome`, and a stop and a start of `play` give the status `running` again

### Requirement: The command stops each product construct

When the command gets an interrupt signal, it SHALL stop each product construct before it stops its own construct, and then stop with exit code 0. When the command process ends for each other cause, also `SIGKILL`, no product construct process SHALL stay.

#### Scenario: An interrupt signal

- **WHEN** `play` runs, and the designer sends an interrupt signal to the command
- **THEN** the terminal shows `wishem: construct play stopped`, the command stops with exit code 0, and the process of `play` ended

#### Scenario: The command process gets SIGKILL

- **WHEN** `play` runs, and the command process gets `SIGKILL`
- **THEN** 2 seconds later the process of `play` ended, and its address refuses a connection
