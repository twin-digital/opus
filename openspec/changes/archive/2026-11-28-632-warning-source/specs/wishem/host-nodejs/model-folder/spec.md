## MODIFIED Requirements

### Requirement: A problem names its file

When the model data from a folder is not correct, each problem that comes from one file SHALL name that file. When the model data from a folder is correct, each warning that comes from one file SHALL name that file.

#### Scenario: A field type that is not known

- **WHEN** a definition file declares a field with the type `number`
- **THEN** the problem names that definition file

#### Scenario: A component type that is not defined

- **WHEN** an entity in `state.json` uses a component type that no definition file declares
- **THEN** the problem names `state.json`

#### Scenario: Two definition files with the same label

- **WHEN** the definition files `definitions/a.json` and `definitions/b.json` of the model folder have the label `AppBar` and different IDs
- **THEN** the terminal shows the line `wishem: warning in definitions/b.json: ` and the text of the warning, and the model is correct

### Requirement: Each line about the product model names the product

Each problem and each warning of a file of the product folder SHALL name the absolute path of that file. Each other line of the storage subsystem of the product SHALL start with `wishem: product: `. The lines of the storage subsystem of the store `store` SHALL not change.

#### Scenario: A file of the product that is saved in part

- **WHEN** the construct runs, and the `state.json` of the product folder `/tmp/a4-product` is saved with text that is not valid JSON
- **THEN** the terminal shows a line that starts with `wishem: problem in /tmp/a4-product/state.json: the text is not valid JSON`, and the line `wishem: product: the last correct model stays`

#### Scenario: A hold of the product

- **WHEN** an input subsystem sends `product/replace-model` that changes a label of a component type of the product
- **THEN** the terminal shows `wishem: product: the definitions of the store differ from the files in definitions, so state.json is not written`

#### Scenario: A stop with a hold of the product

- **WHEN** the definitions of the store `product` differ from the files of the product folder, and the construct stops
- **THEN** the terminal shows `wishem: product: the process stops, and the model folder does not hold the last changes of the store`

#### Scenario: A warning of a definition file of the product

- **WHEN** the construct runs, and a person adds the file `definitions/b.json` to the product folder `/tmp/a4-product` with the label of the component type in `definitions/a.json` and a different ID
- **THEN** the terminal shows a line that starts with `wishem: warning in /tmp/a4-product/definitions/b.json: `, and no line that starts with `wishem: product: warning`
