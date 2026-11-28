# Spec Delta

## MODIFIED Requirements

### Requirement: The entity diagram of the model folder

The architecture document SHALL hold an entity diagram of the model folder, in `nodejs/wishem/docs/architecture/entities-model-folder-light.svg` and `entities-model-folder-dark.svg`. The diagram SHALL show each entity of the model folder, its keys, and each relationship with its cardinality. The diagram SHALL apply to each model folder: the model folder of the workbench and the product folder have the same entities.

#### Scenario: A change adds an entity to the model folder

- **WHEN** a change adds a kind of record to the model folder, such as a relation between entities
- **THEN** the entity diagram shows the new entity, its keys, and its relationships

#### Scenario: A second model folder with the same schema

- **WHEN** a change adds a store of persisted data that has the layout of a model folder, such as the product folder
- **THEN** the architecture document says that the entity diagram applies to that store, and no second entity diagram exists

#### Scenario: A field value refers to an entity

- **WHEN** a field of the type `reference` holds the ID of an entity, or a field of the type `reference-list` holds a list of entity IDs
- **THEN** the entity diagram shows a relationship from `FieldValue` to `Entity` with the label "Refers to", with the mark "zero or more" at `Entity`, and the mark "zero or more" at `FieldValue`
