# Spec Delta

## MODIFIED Requirements

### Requirement: A change of the entities is written to state.json

When the hub applies an input after which the entities of the store differ from the entities that were last read from or written to `state.json`, and the store has the definitions of the disk, the storage subsystem SHALL write the entities to `state.json`. The file SHALL hold one JSON object with the key `entities`, with an indent of two spaces and a final newline. The write SHALL replace the file in one step, so that a reader never gets part of the file.

#### Scenario: An input sets a title

- **WHEN** the construct runs for the base workbench, and an input subsystem sends `store/set-field` that sets the title of the app bar to `Hello`
- **THEN** `state.json` holds the title `Hello`, and a new read of the model folder gives the same model as the part `store`

#### Scenario: Two inputs in a short time

- **WHEN** an input subsystem sends two `store/set-field` inputs, one directly after the other
- **THEN** `state.json` holds the value of the second input after the writes end

#### Scenario: A change of a definition only

- **WHEN** the store applies a `replace-model` input that changes only a label of a component type
- **THEN** the storage subsystem does not write `state.json`, and the terminal shows one line that names `definitions` and `state.json`

#### Scenario: The construct stops directly after an input

- **WHEN** an input sets a title, and the construct stops before the write starts
- **THEN** `state.json` holds the new title when the stop is complete

## ADDED Requirements

### Requirement: The model folder that the process writes always starts

While the definitions of the store differ from the definitions that were last read from the `definitions` folder, the storage subsystem SHALL NOT write `state.json`. Thus each model folder that the process writes gives a correct model, and a new start from it does not fail. A difference in the order of the definitions is a difference.

#### Scenario: A new component type and an entity that uses it

- **WHEN** a client of the link sends `store/replace-model` with a new component type and an entity that has a component of that type
- **THEN** the part `store` holds the new model, `state.json` does not change, and a new start of the construct from the model folder does not fail

#### Scenario: A new component type, then an entity that uses it

- **WHEN** an input subsystem sends `store/replace-model` that adds only a component type, and then sends `store/add-entity` with an entity that has a component of that type
- **THEN** `state.json` does not change

#### Scenario: A new field, then a value for it

- **WHEN** an input subsystem sends `store/replace-model` that adds a field to an existing component type, and then sends `store/set-field` for that field
- **THEN** `state.json` does not change

#### Scenario: A removed component type

- **WHEN** an input subsystem sends `store/replace-model` that removes a component type and its components from each entity
- **THEN** `state.json` does not change, and no file in `definitions` changes

### Requirement: The process reports definitions that the model folder does not hold

When the definitions of the store become different from the definitions that were last read from the `definitions` folder, the process SHALL print one line that names `definitions` and `state.json`. While the difference continues, the process SHALL NOT print that line again. When the definitions become equal again, the process SHALL print one line that names `definitions`.

#### Scenario: Two inputs while the definitions differ

- **WHEN** an input subsystem sends `store/replace-model` that changes a label of a component type, and then sends `store/set-field` that sets a title
- **THEN** the terminal shows the line that names `definitions` and `state.json` one time

#### Scenario: A second difference

- **WHEN** the definitions of the store differ, become equal again, and then differ again
- **THEN** the terminal shows the line that names `definitions` and `state.json` two times, and the line for equal definitions one time

### Requirement: The entities are written when the definitions are equal again

When the definitions of the store become equal to the definitions that were last read from the `definitions` folder, and the entities of the store differ from the entities that were last read from or written to `state.json`, the storage subsystem SHALL write the entities to `state.json`. This SHALL occur when an input makes the definitions equal, and also when a read of the model folder makes them equal.

#### Scenario: An input puts back the definitions of the disk

- **WHEN** the definitions of the store differ and an input set a title, and then an input subsystem sends `store/replace-model` with the definitions of the disk and the entities of the store
- **THEN** `state.json` holds the new title

#### Scenario: A person adds the definition file

- **WHEN** a client of the link added a component type and an entity that uses it, and then a person adds a definition file for that component type, so that the definitions on the disk are equal to the definitions of the store
- **THEN** the record of the hub holds no new input, `state.json` holds the new entity, and a new start of the construct from the model folder does not fail

### Requirement: The process reports a stop that loses changes

When the construct stops while the definitions of the store differ from the definitions that were last read from the `definitions` folder, the process SHALL print one line that says that the model folder does not hold the last changes of the store.

#### Scenario: A stop after a change of a definition

- **WHEN** an input subsystem sends `store/replace-model` that changes a label of a component type, and the construct stops
- **THEN** the terminal shows the line for the stop one time, and `state.json` and the files in `definitions` do not change

#### Scenario: A stop with equal definitions

- **WHEN** an input sets a title, and the construct stops
- **THEN** the terminal does not show the line for the stop
