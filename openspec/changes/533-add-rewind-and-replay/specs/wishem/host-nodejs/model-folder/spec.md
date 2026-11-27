# Spec Delta

## MODIFIED Requirements

### Requirement: A change of the entities is written to state.json

When the hub applies an input after which the entities of the store differ from the entities that were last read from or written to `state.json`, and the store has the definitions of the disk, the storage subsystem SHALL write the entities to `state.json`. A rewind SHALL be such an input. The file SHALL hold one JSON object with the key `entities`, with an indent of two spaces and a final newline. The write SHALL replace the file in one step, so that a reader never gets part of the file.

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

#### Scenario: A rewind before a change of the title

- **WHEN** an input sets the title to `Hello`, and then an input subsystem sends `hub/rewind` with the sequence number before that input
- **THEN** `state.json` holds the title before `Hello` after the write ends

#### Scenario: An input that does not change the store

- **WHEN** the hub applies an input after which the part `store` is the same object as before
- **THEN** the storage subsystem does not write `state.json`
