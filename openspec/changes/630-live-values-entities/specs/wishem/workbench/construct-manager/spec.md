## MODIFIED Requirements

### Requirement: The construct manager sends each change of the product model

After each input that makes the part `product` of the workbench a different object, the construct manager SHALL send the change to each running product construct, with the source `construct-manager`. When only values of components that the two models both hold differ, it SHALL send one `store/set-field` for each changed or added value and one `store/clear-field` for each removed value. Each other value SHALL keep its live value.

#### Scenario: A hand edit of a value

- **WHEN** a construct of the sample product runs with a count of `25`, and a person changes the color in the `state.json` of the product folder to `#b91c1c`
- **THEN** the store of the construct holds `#b91c1c`, its record holds one `store/set-field` with the source `construct-manager`, and the count continues from its live value

#### Scenario: An input to the product

- **WHEN** a construct runs, and an input subsystem sends `product/set-field` that sets the count to `100` in the workbench
- **THEN** the store of the construct holds the count `100` or a count that the ticks added to `100`

#### Scenario: A cleared value

- **WHEN** a construct of the sample product is paused with a count of `25`, and an input subsystem sends `product/clear-field` for the color in the workbench
- **THEN** the construct gets one `store/clear-field` for the color with the source `construct-manager`, its store holds no color, and it still holds the count `25`

#### Scenario: A hand edit removes a value

- **WHEN** a construct of the sample product runs, and a person removes the color from the `Color` component in the `state.json` of the product folder and keeps the empty component
- **THEN** the construct gets one `store/clear-field` for the color, and no `store/replace-model`

#### Scenario: A hand edit removes a component

- **WHEN** a construct runs, and a person removes the `Color` component of the sample entity in the `state.json` of the product folder
- **THEN** the construct gets one `store/replace-model` with the product model

#### Scenario: A change of a definition

- **WHEN** a construct runs, and the label of a component type of the product model changes
- **THEN** the construct gets one `store/replace-model` with the product model, and its entities are the entities of the product model

#### Scenario: A rewind of the workbench

- **WHEN** an input changed a value of the product, and `hub/rewind` of the workbench returns the part `product` to the value before that input
- **THEN** the construct gets one `store/set-field` with the earlier value, and its record holds no rewind

#### Scenario: A rewind of the workbench after a clear

- **WHEN** an input cleared a value of the product, and `hub/rewind` of the workbench returns the part `product` to the value before that input
- **THEN** the construct gets one `store/set-field` with the earlier value

#### Scenario: A rewind of the workbench after a set of a new value

- **WHEN** an input set a value for a field that had no value, and `hub/rewind` of the workbench returns the part `product` to the state before that input
- **THEN** the construct gets one `store/clear-field` for that field

#### Scenario: A change that the construct refuses

- **WHEN** the construct refuses an input of a change
- **THEN** the construct manager reports the message of the refusal for that construct, and it sends the next change

### Requirement: A step back keeps the time state and the authored changes

A step back SHALL keep the `running` value that the product construct had before it. It SHALL keep each change of the product model that the construct manager sent after the target. The construct manager SHALL send the rewind and the inputs that keep these values with no tick of the clock between them.

#### Scenario: A step back during a pause

- **WHEN** `play` ran, was paused, and an input subsystem sends `constructs/rewind` with `ticks` set to `1`
- **THEN** the part `time` of `play` has `running` set to `false`, and the clock sends no tick for 1 second

#### Scenario: A change of the product before a step back

- **WHEN** `play` is paused, an input subsystem sends `product/set-field` that sets the color to `#b91c1c`, and then `constructs/rewind` with `ticks` set to `1`
- **THEN** the store of `play` holds `#b91c1c`, and its count is the count before the last tick

#### Scenario: A step back while the construct runs

- **WHEN** `play` runs, and an input subsystem sends `constructs/rewind` with `ticks` set to `1`
- **THEN** the part `time` of `play` has `running` set to `true` after the rewind

#### Scenario: An added entity before a step back

- **WHEN** `play` is paused after a step, an input subsystem sends `product/add-entity` with a second entity, and then `constructs/rewind` with `ticks` set to `1`
- **THEN** the store of `play` holds the second entity after the sample entity, `play` gets `store/add-entity` after the `hub/rewind`, and the count of the sample entity is the count before the last tick

## ADDED Requirements

### Requirement: The construct manager sends an added or removed entity

When the definitions of the two product models are equal, and the entities that the two models both hold have the same order and the same component types, the construct manager SHALL send one `store/add-entity` for each added entity, with its position in the new model, and one `store/remove-entity` for each removed entity. The entities that the two models both hold SHALL keep their live values, except the values that the change changes.

#### Scenario: An added entity

- **WHEN** a construct of the sample product is paused with a count of `25`, and an input subsystem sends `product/add-entity` with a second entity that has a `Counter` component with the count `1000`
- **THEN** the construct gets one `store/add-entity` with the source `construct-manager` and no `store/replace-model`, its store holds the sample entity with the count `25` and then the second entity with the count `1000`

#### Scenario: A removed entity

- **WHEN** a construct of the sample product is paused with a count of `25` and holds a second entity, and a person removes the second entity from the `state.json` of the product folder
- **THEN** the construct gets one `store/remove-entity` for the second entity and no `store/replace-model`, and it still holds the count `25`

#### Scenario: An entity at the start of the list

- **WHEN** a construct runs, and a person adds an entity before the sample entity in the `state.json` of the product folder
- **THEN** the construct gets one `store/add-entity` with the `index` 0, and the order of the entities in its store is the order of the product model

#### Scenario: A rewind of the workbench after a removal

- **WHEN** the product holds three entities, an input removes the second one, and `hub/rewind` of the workbench returns the part `product` to the state before that input
- **THEN** the construct gets one `store/add-entity` with the `index` 1 and the authored values of that entity, and the other two entities keep their live values

#### Scenario: A rewind of the workbench after an addition

- **WHEN** an input added an entity to the product, and `hub/rewind` of the workbench returns the part `product` to the state before that input
- **THEN** the construct gets one `store/remove-entity` for that entity

#### Scenario: An addition, a removal, and a value in one change

- **WHEN** a person adds one entity, removes a different entity, and changes the color of the sample entity in one write of the `state.json` of the product folder
- **THEN** the construct gets one `store/add-entity`, one `store/set-field`, and one `store/remove-entity`, no `store/replace-model`, and the count of the sample entity keeps its live value

### Requirement: The inputs of an entity change are accepted in order

The construct manager SHALL send the inputs of a change that adds or removes entities in an order in which a store that holds the earlier product model accepts each input, and after the last input holds the new product model. A reference to an entity that is not yet in the store SHALL go in a `store/set-field` after the `store/add-entity` of that entity. A reference between two removed entities SHALL be cleared before their removal.

#### Scenario: A new entity that refers to an entity of the store

- **WHEN** one change adds an entity whose reference field names the sample entity
- **THEN** the construct gets one `store/add-entity` with the reference, and the store accepts it

#### Scenario: An entity of the store that refers to a new entity

- **WHEN** one change adds an entity and sets a reference field of an entity of the store to it
- **THEN** the construct gets the `store/add-entity` first and then the `store/set-field` of the reference, and the store accepts each one

#### Scenario: Two new entities that refer to each other

- **WHEN** one change adds the entities `a` and `b`, the reference field of `a` names `b`, and the reference field of `b` names `a`
- **THEN** the construct gets `store/add-entity` of `a` with no value for the field, `store/add-entity` of `b` with its reference, and then `store/set-field` of the reference of `a`, and the store accepts each one

#### Scenario: Two removed entities that refer to each other

- **WHEN** one change removes the entities `a` and `b`, and each one has a reference field that names the other
- **THEN** the construct gets `store/clear-field` of each of the two references, and then `store/remove-entity` of `a` and of `b`, and the store accepts each one

#### Scenario: A reference that moves from a removed entity to a new entity

- **WHEN** a reference field of the sample entity names the entity `a`, and one change removes `a`, adds the entity `b`, and sets the reference to `b`
- **THEN** the construct gets `store/add-entity` of `b`, then `store/set-field` of the reference, and then `store/remove-entity` of `a`, and the store accepts each one

#### Scenario: An entity that refers to itself

- **WHEN** one change adds an entity whose reference field names that same entity
- **THEN** the construct gets one `store/add-entity` with the reference, and the store accepts it

### Requirement: A change that cannot keep the live values replaces the model

When a change of the product model changes the definitions, the order of the entities that the two models both hold, or the component types of such an entity, the construct manager SHALL send one `store/replace-model` with the new model to each running product construct. This SHALL also be true when the same change adds or removes an entity.

#### Scenario: A new order of the entities

- **WHEN** a construct runs with two entities, and a person changes the order of the two entities in the `state.json` of the product folder
- **THEN** the construct gets one `store/replace-model` with the product model

#### Scenario: An added entity and a change of a definition

- **WHEN** a construct runs, and one change of the product model adds an entity and changes the label of a component type
- **THEN** the construct gets one `store/replace-model` with the product model
