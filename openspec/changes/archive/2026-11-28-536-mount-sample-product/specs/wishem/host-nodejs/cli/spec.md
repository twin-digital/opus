# Spec Delta

## ADDED Requirements

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
