# Spec Delta

## Purpose

Defines how the workbench construct mounts the authored model of one product: where the product model is in the joined state, how it stays separate from the model of the workbench, and how each of the two models is kept.

## ADDED Requirements

### Requirement: A mounted product is a second store

When a product is mounted, the workbench construct SHALL have two stores. The store with the ID `store` SHALL hold the authored model of the workbench. The store with the ID `product` SHALL hold the authored model of the product. The joined state SHALL have the parts `store` and `product`. The input types of the product store SHALL start with `product/`.

#### Scenario: A construct with a mounted product

- **WHEN** a construct starts with the model folder of the base workbench and the model folder of the sample product
- **THEN** the part `store` holds the component type `AppBar`, and the part `product` holds the component types `Color` and `Counter` and one entity

#### Scenario: An input to the product

- **WHEN** an input subsystem sends `product/set-field` that sets the count of the sample entity to `7`
- **THEN** the part `product` holds the count `7`, and the part `store` is the same object as before

#### Scenario: No product

- **WHEN** a construct starts with no product folder
- **THEN** the joined state has no part `product`, and the hub refuses an input of the type `product/set-field` with the reason `unknown-type`

### Requirement: The product model refers to nothing of the workbench

The store `product` SHALL validate the product model alone. A thing of the product model that refers to a definition of the workbench model SHALL be a problem of the product model. A change of the workbench model SHALL NOT change the part `product`.

#### Scenario: A product entity with a component of the workbench

- **WHEN** an input subsystem sends `product/add-entity` with an entity that has an `AppBar` component
- **THEN** the hub refuses the input with the reason `invalid`, and the part `product` does not change

#### Scenario: A product folder that uses a component type of the workbench

- **WHEN** the `state.json` of the product folder holds an entity with an `AppBar` component, and the construct starts
- **THEN** the start fails with a problem that names the `state.json` of the product folder

#### Scenario: A change of the workbench model

- **WHEN** an input subsystem sends `store/set-field` that sets the title of the app bar
- **THEN** the part `product` is the same object as before

### Requirement: Each model has its own model folder

The storage subsystem SHALL keep the workbench model in its model folder and the product model in the product folder. A hand edit of a file of one folder SHALL change only the store of that folder. A change of one store SHALL write only the `state.json` of its own folder. The product folder SHALL be a different folder from the model folder.

#### Scenario: A hand edit of the product folder

- **WHEN** the construct runs, and a person changes the count in the `state.json` of the product folder to `5`
- **THEN** the part `product` holds the count `5`, the record holds one `product/replace-model` input with the source `product-files`, and the part `store` is the same object as before

#### Scenario: A change of the product through an input

- **WHEN** an input subsystem sends `product/set-field` that sets the color to `#b91c1c`
- **THEN** the `state.json` of the product folder holds `#b91c1c`, and the `state.json` of the model folder does not change

#### Scenario: A stop and a start

- **WHEN** an input sets the count of the product to `9`, the construct stops, and a new construct starts with the same two folders
- **THEN** the part `product` holds the count `9`

#### Scenario: The same folder two times

- **WHEN** a construct starts with the same folder as the model folder and as the product folder
- **THEN** the start fails with a message that the two folders are the same folder, and no server starts

### Requirement: A rewind restores the two models

A rewind SHALL return the two stores to the state after the target. After a rewind, each storage subsystem SHALL write the entities of its own store when they differ from its `state.json`.

#### Scenario: A rewind before a change of the product

- **WHEN** an input sets the count of the product to `3`, and then an input subsystem sends `hub/rewind` with the sequence number before that input
- **THEN** the part `product` holds the count before `3`, the `state.json` of the product folder holds that count after the write ends, and the `state.json` of the model folder does not change

#### Scenario: A rewind past changes of the two models

- **WHEN** an input sets the title of the app bar, an input sets the count of the product, and then `hub/rewind` returns to the state before the two inputs
- **THEN** the two `state.json` files hold the values before the two inputs
