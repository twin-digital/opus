# Spec Delta

## ADDED Requirements

### Requirement: A storage subsystem keeps one store

A storage subsystem SHALL keep one model folder for one store, which its options name by the ID. It SHALL send its `replace-model` inputs to that store, SHALL read the entities and the definitions of that store, and SHALL compare them with its own folder. The default ID SHALL be `store`. Each rule of this capability SHALL apply to each storage subsystem alone.

#### Scenario: Two storage subsystems on one hub

- **WHEN** a hub has the stores `store` and `product`, and each one has its own storage subsystem and folder
- **THEN** a hand edit of the `state.json` of the product folder sends one `product/replace-model` input, and no `store/replace-model` input

#### Scenario: A hold of one storage subsystem

- **WHEN** an input subsystem sends `product/replace-model` that changes a label of a component type of the product, and then `store/set-field` sets the title of the app bar
- **THEN** the `state.json` of the product folder does not change, and the `state.json` of the model folder holds the new title

### Requirement: The storage subsystems of the product have their own IDs

The storage subsystem of the store `product` SHALL attach the input subsystem `product-files` and the output subsystem `product-files-writer`. The storage subsystem of the store `store` SHALL keep the IDs `files` and `files-writer`.

#### Scenario: The source of a hand edit of the product

- **WHEN** a person saves a change to the `state.json` of the product folder
- **THEN** the record of the hub holds one `product/replace-model` input with the source `product-files`

### Requirement: Each line about the product model names the product

Each problem of a file of the product folder SHALL name the absolute path of that file. Each other line of the storage subsystem of the product SHALL start with `wishem: product: `. The lines of the storage subsystem of the store `store` SHALL not change.

#### Scenario: A file of the product that is saved in part

- **WHEN** the construct runs, and the `state.json` of the product folder `/tmp/a4-product` is saved with text that is not valid JSON
- **THEN** the terminal shows a line that starts with `wishem: problem in /tmp/a4-product/state.json: the text is not valid JSON`, and the line `wishem: product: the last correct model stays`

#### Scenario: A hold of the product

- **WHEN** an input subsystem sends `product/replace-model` that changes a label of a component type of the product
- **THEN** the terminal shows `wishem: product: the definitions of the store differ from the files in definitions, so state.json is not written`

#### Scenario: A stop with a hold of the product

- **WHEN** the definitions of the store `product` differ from the files of the product folder, and the construct stops
- **THEN** the terminal shows `wishem: product: the process stops, and the model folder does not hold the last changes of the store`
