# Spec Delta

## ADDED Requirements

### Requirement: The start script checks the product code in a child process

The `start` script SHALL check the module of `--product-code` in a child process before the construct of the workbench starts. The process of the script SHALL NOT load the module. A check that gives no answer in 5 seconds SHALL fail, and its child process SHALL end.

#### Scenario: The script does not load the module

- **WHEN** a person runs the script with `--product-code` and a module that writes the ID of its process to a file when it loads
- **THEN** after the line `wishem: workbench at <address>`, the file holds one process ID, that ID is not the ID of the process of the script, and that process ended

#### Scenario: A module that does not end at the check

- **WHEN** a person runs the script with `--product-code` and a module that does not end when it loads
- **THEN** at most 7 seconds later the command prints `wishem: the product code <value> cannot be loaded: The check did not end in 5 seconds.`, serves no page, and stops with a non-zero exit code
