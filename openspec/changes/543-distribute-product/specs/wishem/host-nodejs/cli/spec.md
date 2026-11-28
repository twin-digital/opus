# Spec Delta

## ADDED Requirements

### Requirement: The command has the subcommand build

The `wishem` command SHALL have two subcommands: `start` and `build`. The usage line SHALL name both. The specification `wishem/distribution/product-build` gives the behavior of `build`. A different subcommand, or no subcommand, SHALL print the usage line and end with exit code 2.

#### Scenario: The usage line

- **WHEN** the designer runs `wishem` with no argument
- **THEN** the command prints a usage line that names `wishem start` and `wishem build`, and ends with exit code 2

#### Scenario: A subcommand that is not known

- **WHEN** the designer runs `wishem run ./model`
- **THEN** the command prints the usage line and ends with exit code 2
