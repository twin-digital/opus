## MODIFIED Requirements

### Requirement: An input adds an entity

The input `add-entity` SHALL hold one entity with its ID and its components, and MAY hold an `index`. With no `index`, the store SHALL add the entity at the end of the list of entities. With an `index`, the store SHALL put the entity at that position, and the entities from that position SHALL move one position back. The store SHALL refuse the input when an entity with that ID exists, and when `index` is not an integer from 0 to the number of entities.

#### Scenario: A second entity

- **WHEN** the store holds one entity and gets `add-entity` with a correct entity that has a new ID
- **THEN** the part holds two entities, and the new entity is the last one

#### Scenario: An ID that exists

- **WHEN** the store gets `add-entity` with the ID of an entity that it holds
- **THEN** the store refuses the input with a problem that names the ID

#### Scenario: An entity at the start

- **WHEN** the store holds the entities `a` and `b` and gets `add-entity` with the entity `c` and the `index` 0
- **THEN** the part holds `c`, `a`, and `b` in this order, and `a` and `b` are the same objects as before

#### Scenario: An entity between two entities

- **WHEN** the store holds the entities `a` and `b` and gets `add-entity` with the entity `c` and the `index` 1
- **THEN** the part holds `a`, `c`, and `b` in this order

#### Scenario: An index at the end

- **WHEN** the store holds two entities and gets `add-entity` with a new entity and the `index` 2
- **THEN** the new entity is the last one

#### Scenario: An index that is not correct

- **WHEN** the store holds two entities and gets `add-entity` with the `index` 3, -1, 1.5, or `"1"`
- **THEN** the store refuses the input with a problem at the path `payload`, `index`, and the part is the same object as before
