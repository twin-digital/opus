# Spec Delta

## ADDED Requirements

### Requirement: The page address carries the link of each product construct

The page server SHALL pass a WebSocket at the path `/constructs/<id>/link` to the link of the product construct `<id>` that runs. For an ID with no running product construct, the page server SHALL answer with the status 404 and close the connection. A link through this path SHALL end when the product construct stops.

#### Scenario: A link through the address of the page

- **WHEN** the workbench runs with a product, `play` runs, and a client opens a link at `/constructs/play/link` of the address of the page
- **THEN** the client gets the `welcome` message of `play`, with the parts `time` and `store`

#### Scenario: A construct that does not run

- **WHEN** the workbench runs with a product, and a client asks for `/constructs/other/link` at the address of the page
- **THEN** the answer has the status 404, and no link opens

#### Scenario: A stop of the construct

- **WHEN** a client has a link at `/constructs/play/link`, and an input subsystem sends `constructs/stop` with `play`
- **THEN** the client gets the `stopping` event, and the connection closes

#### Scenario: The link of the workbench

- **WHEN** a client has a link at `/constructs/play/link`
- **THEN** a link at `/link` of the same address still gets the `welcome` message of the workbench construct

### Requirement: The option --product-views names the React views of the product

The option `--product-views <folder>` SHALL name a folder of React views and sidecars of the product. A relative path SHALL be relative to the folder in which the person runs the command. The script SHALL print the line `wishem: product views <absolute path>` after the line of the product code, or after the line of the product folder. The page server SHALL give the page the pairs of a sidecar and a view file of that folder. With no option, the page SHALL get no view of the product.

#### Scenario: The views of the sample product

- **WHEN** a person runs the script with `--product nodejs/wishem/sample-product/model --product-code @thrashplay/wishem-sample-product --product-views nodejs/wishem/sample-product/views/react` from the root of the repository
- **THEN** the command prints `wishem: product views <absolute path of nodejs/wishem/sample-product/views/react>` after the line of the product code, and the page gets the views `ClearColor` and `Count`

#### Scenario: A folder that does not exist

- **WHEN** a person runs the script with `--product` and `--product-views ./missing`
- **THEN** the command prints `wishem: the product views folder <absolute path> does not exist`, serves no page, the port of the hub is free again, and the command stops with a non-zero exit code

#### Scenario: Product views with no product

- **WHEN** a person runs the script with `--product-views` and no `--product`
- **THEN** the command prints `wishem: --product-views needs --product`, serves no page, and stops with a non-zero exit code

#### Scenario: A new view file

- **WHEN** the workbench runs with `--product-views`, the page is open, and a person adds a sidecar and its view file to the folder
- **THEN** the page loads again and gets the new view
