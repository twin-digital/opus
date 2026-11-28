# Spec Delta

## MODIFIED Requirements

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
