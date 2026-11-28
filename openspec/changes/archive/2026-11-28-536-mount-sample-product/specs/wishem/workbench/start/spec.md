# Spec Delta

## ADDED Requirements

### Requirement: The start script mounts a product

The option `--product <folder>` of the `start` script of the workbench page SHALL mount the model of that folder in the construct of the workbench. A relative path SHALL be relative to the folder in which the person runs the command. The script SHALL print the absolute path of the product folder after the line of the model folder. With no option, the script SHALL mount no product.

#### Scenario: Start the workbench with the sample product

- **WHEN** a person runs `pnpm --filter @thrashplay/wishem-workbench-app start --product nodejs/wishem/sample-product/model` from the root of the repository
- **THEN** the command prints `wishem: model <path>`, `wishem: product <absolute path of nodejs/wishem/sample-product/model>`, the address of the link, and the address of the page, and a client of the link at the address of the page gets a `welcome` message with the parts `store` and `product`

#### Scenario: The page with a mounted product

- **WHEN** the workbench runs with a mounted product, and a web browser opens the address of the page
- **THEN** the page shows the app bar and the zero state, as with no product

#### Scenario: A product that is not correct

- **WHEN** a person runs the script with `--product` and a product folder whose `state.json` is not valid JSON
- **THEN** the command prints a problem that names the absolute path of that `state.json`, serves no page, the port of the hub is free again, and the command stops with a non-zero exit code
