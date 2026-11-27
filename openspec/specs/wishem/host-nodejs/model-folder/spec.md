# wishem/host-nodejs/model-folder Specification

## Purpose

Defines how a Node.js process stores a Wishem model as files in a model folder: how the storage subsystem changes those files into the model data that the store validates, how the store follows changes to the files, and how a change of the entities is written to `state.json`.

## Requirements

### Requirement: Model folder layout

A model folder SHALL hold a `definitions` folder and a `state.json` file. Each `.json` file in `definitions` SHALL hold one component type. `state.json` SHALL hold an object with the key `entities`, the list of the entities. A file in `definitions` that does not end in `.json` SHALL be ignored.

#### Scenario: A model with one component type and one entity

- **WHEN** a model folder holds `definitions/ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34.json` and `state.json`
- **THEN** the model data has the component type of that file in `definitions`, and the entities of `state.json` in `entities`

#### Scenario: No state file

- **WHEN** a model folder has no `state.json`
- **THEN** the folder gives no model, and the problem names the missing file

#### Scenario: No definitions

- **WHEN** a model folder has no `definitions` folder, or the folder is empty
- **THEN** the model data has no component types, and this is not a problem

#### Scenario: A file that is not a definition

- **WHEN** `definitions` holds a file with the name `notes.txt`
- **THEN** the file is ignored

#### Scenario: The folder does not exist

- **WHEN** the path of the model folder does not exist
- **THEN** the folder gives no model, and the problem names the path

### Requirement: The name of a definition file has no meaning

The ID of a component type SHALL come only from the `id` in its definition file. The host SHALL NOT use the name of the file as an ID or as a label. A change to a label SHALL NOT need a change to a file name.

#### Scenario: A file name that is different from the ID

- **WHEN** a definition file has the name `app-bar.json` and holds the ID `ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34`
- **THEN** the component type has the ID `ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34`

#### Scenario: A label changes

- **WHEN** the label in a definition file changes from `AppBar` to `Header`
- **THEN** the name of the file and the content of `state.json` do not change

### Requirement: Files that are not valid JSON

When `state.json` or a definition file is not valid JSON, the folder SHALL give no model, and the problem SHALL name the file.

#### Scenario: A file that is saved in part

- **WHEN** `state.json` holds text that is not valid JSON
- **THEN** the folder gives no model, and the problem names `state.json`

### Requirement: A problem names its file

When the model data from a folder is not correct, each problem that comes from one file SHALL name that file.

#### Scenario: A field type that is not known

- **WHEN** a definition file declares a field with the type `number`
- **THEN** the problem names that definition file

#### Scenario: A component type that is not defined

- **WHEN** an entity in `state.json` uses a component type that no definition file declares
- **THEN** the problem names `state.json`

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

#### Scenario: A rewind makes the definitions of the store equal to the files

- **WHEN** an input changed a label of a component type in the store, so that the write of `state.json` waits, and then an input subsystem sends `hub/rewind` with the sequence number before that input
- **THEN** the terminal shows the line that says that the definitions are equal again, and `state.json` holds the entities of the store

#### Scenario: A rewind makes the definitions of the store different from the files

- **WHEN** a person changed a definition file and the store followed it, and then an input subsystem sends `hub/rewind` with the sequence number before that change
- **THEN** the storage subsystem does not write `state.json`, and the terminal shows one line that names `definitions` and `state.json`

#### Scenario: An input that does not change the store

- **WHEN** the hub applies an input after which the part `store` is the same object as before
- **THEN** the storage subsystem does not write `state.json`

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
