# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: The core follows the model files`
- TO: `### Requirement: The store follows the model files`

## MODIFIED Requirements

### Requirement: The store follows the model files

The storage subsystem SHALL watch `state.json` and the `definitions` folder. After a file changes, is added, or is removed, the storage subsystem SHALL read the model folder again and SHALL send the model to the store as one `replace-model` input. A restart of the process SHALL NOT be necessary.

#### Scenario: A hand edit to the authored state

- **WHEN** the construct runs, and a person changes the title in `state.json` from `Wishem` to `Wishem workbench` and saves the file
- **THEN** the part `store` of the joined state holds `Wishem workbench`, in less than 2 seconds

#### Scenario: A hand edit to a definition

- **WHEN** the construct runs, and a person changes the label of a component type in its definition file
- **THEN** the part `store` holds the new label

#### Scenario: A new definition file

- **WHEN** the construct runs, and a person adds a correct definition file to `definitions`
- **THEN** the part `store` holds the new component type

#### Scenario: A save through a temporary file

- **WHEN** an editor saves `state.json` as a temporary file and then renames it to `state.json`
- **THEN** the part `store` holds the new content

#### Scenario: The source of the input

- **WHEN** a person saves a change to `state.json`
- **THEN** the record of the hub holds one `store/replace-model` input with the source `files`

### Requirement: The last correct model stays

When the model files are not correct during a run, the storage subsystem SHALL send no input, the store SHALL keep the last correct model, and the process SHALL continue to run. When the files are correct again, the store SHALL hold the new model.

#### Scenario: A file that is saved in part

- **WHEN** the construct runs and `state.json` is saved with text that is not valid JSON
- **THEN** the part `store` does not change, and the record of the hub holds no new input

#### Scenario: The file is corrected

- **WHEN** `state.json` was not correct, and a person saves a correct `state.json`
- **THEN** the part `store` holds the new content

## ADDED Requirements

### Requirement: A change of the entities is written to state.json

When the hub applies an input after which the entities of the store differ from the entities that were last read from or written to `state.json`, the storage subsystem SHALL write the entities to `state.json`. The file SHALL hold one JSON object with the key `entities`, with an indent of two spaces and a final newline. The write SHALL replace the file in one step, so that a reader never gets part of the file.

#### Scenario: An input sets a title

- **WHEN** the construct runs for the base workbench, and an input subsystem sends `store/set-field` that sets the title of the app bar to `Hello`
- **THEN** `state.json` holds the title `Hello`, and a new read of the model folder gives the same model as the part `store`

#### Scenario: Two inputs in a short time

- **WHEN** an input subsystem sends two `store/set-field` inputs, one directly after the other
- **THEN** `state.json` holds the value of the second input after the writes end

#### Scenario: A change of a definition only

- **WHEN** the store applies a `replace-model` input that changes only a label of a component type
- **THEN** the storage subsystem does not write `state.json`

#### Scenario: The construct stops directly after an input

- **WHEN** an input sets a title, and the construct stops before the write starts
- **THEN** `state.json` holds the new title when the stop is complete

### Requirement: The storage subsystem writes no definition file

The storage subsystem SHALL NOT write, add, or remove a file in the `definitions` folder.

#### Scenario: An input changes a definition

- **WHEN** an input subsystem sends `store/replace-model` with a model in which a label of a component type is different
- **THEN** no file in `definitions` changes

### Requirement: A write of the model folder does not come back as a change

After the storage subsystem writes `state.json`, the read that the watch starts SHALL NOT cause one more write. A read of the model folder whose content is equal to the content that was last read or written SHALL send no input. A part of the folder that did not change since the last read or write SHALL NOT replace the same part of the store.

#### Scenario: The watch sees the write

- **WHEN** an input sets a title, and the storage subsystem writes `state.json`
- **THEN** `state.json` is written one time, and the record of the hub holds no `replace-model` input after the input that set the title

#### Scenario: A file is saved with no change

- **WHEN** a person saves `state.json` with the content that it holds
- **THEN** the record of the hub holds no new input

#### Scenario: A full model that is equal

- **WHEN** an input subsystem sends `store/replace-model` with a model that is equal to the part `store`
- **THEN** the storage subsystem does not write `state.json`

#### Scenario: A read that started before an input

- **WHEN** a read of the model folder starts, an input sets a title before the read ends, and `state.json` did not change on the disk
- **THEN** the part `store` keeps the new title, and `state.json` holds the new title after the write

### Requirement: The process reports a write that fails

When a write of `state.json` fails, the process SHALL print a line that names `state.json` and the reason, SHALL continue to run, and SHALL keep the state of the store. The next change of the entities SHALL start a new write.

#### Scenario: The folder cannot be written

- **WHEN** the model folder is read-only, and an input sets a title
- **THEN** the terminal shows a line that names `state.json`, and the part `store` holds the new title
