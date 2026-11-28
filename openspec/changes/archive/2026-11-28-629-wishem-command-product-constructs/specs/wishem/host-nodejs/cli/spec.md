# Spec Delta

## MODIFIED Requirements

### Requirement: The command mounts a product

The option `--product <folder>` of `wishem start` SHALL mount the model of that folder as the store `product`. The command SHALL print the absolute path of the product folder after the line of the model folder, and the counts of the product model after the counts of the model. The usage line SHALL name the option.

#### Scenario: A workbench with the sample product

- **WHEN** the designer runs `wishem start /tmp/a4-model --product /tmp/a4-product`, and the two folders are correct
- **THEN** the command prints `wishem: model /tmp/a4-model`, `wishem: product /tmp/a4-product`, `wishem: 1 component type, 1 entity`, `wishem: product: 2 component types, 1 entity`, and the address of the link, in this order

#### Scenario: The usage line

- **WHEN** the designer runs `wishem start` with no folder
- **THEN** the command prints `usage: wishem start <folder> [--product <folder>] [--product-code <module>] [--port <number>]` and stops with exit code 2

## ADDED Requirements

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
