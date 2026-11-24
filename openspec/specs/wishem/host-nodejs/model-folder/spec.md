# wishem/host-nodejs/model-folder Specification

## Purpose

Defines how the Node.js host stores a Wishem model as files in a model folder, how the host changes those files into the model data that a core validates, and how the core follows changes to the files.

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

### Requirement: The core follows the model files

The host SHALL watch `state.json` and the `definitions` folder. After a file changes, is added, or is removed, the host SHALL read the model folder again and give the model data to the core. A restart of the host SHALL NOT be necessary.

#### Scenario: A hand edit to the authored state

- **WHEN** the host runs, and a person changes the title in `state.json` from `Wishem` to `Wishem workbench` and saves the file
- **THEN** the snapshot of the core holds `Wishem workbench`, in less than 2 seconds

#### Scenario: A hand edit to a definition

- **WHEN** the host runs, and a person changes the label of a component type in its definition file
- **THEN** the snapshot of the core holds the new label

#### Scenario: A new definition file

- **WHEN** the host runs, and a person adds a correct definition file to `definitions`
- **THEN** the snapshot of the core holds the new component type

#### Scenario: A save through a temporary file

- **WHEN** an editor saves `state.json` as a temporary file and then renames it to `state.json`
- **THEN** the snapshot of the core holds the new content

### Requirement: The last correct model stays

When the model files are not correct during a run, the core SHALL keep the last correct model, and the host SHALL continue to run. When the files are correct again, the core SHALL hold the new model.

#### Scenario: A file that is saved in part

- **WHEN** the host runs and `state.json` is saved with text that is not valid JSON
- **THEN** the snapshot of the core does not change

#### Scenario: The file is corrected

- **WHEN** `state.json` was not correct, and a person saves a correct `state.json`
- **THEN** the snapshot of the core holds the new content
