# Spec Delta

## Purpose

Defines what a snapshot of a Wishem model holds, and the read operations that a core gives to code in the same process, such as a host or a renderer. The transport of a snapshot to a different process belongs to a host.

## ADDED Requirements

### Requirement: A snapshot holds the definitions and the authored state

A snapshot SHALL be one JSON value with two keys: `definitions`, the list of the component types of the model, and `entities`, the list of the entities of the authored state. A snapshot SHALL hold IDs and labels as the model files give them. A caller SHALL need no other source to read the model.

#### Scenario: The snapshot of the base workbench

- **WHEN** a core holds a model with the component type `AppBar` and one entity that has an `AppBar` component with the title `Wishem`
- **THEN** the snapshot has one item in `definitions` with the label `AppBar` and its `title` field, and one item in `entities` whose component holds the value `Wishem` under the ID of the `title` field

### Requirement: A core gives the current snapshot on request

A core SHALL give its current snapshot at any time after it starts. The request SHALL NOT change the core.

#### Scenario: Two requests with no change between them

- **WHEN** a caller gets the snapshot two times and the model does not change
- **THEN** the two snapshots are equal

### Requirement: A core sends each new snapshot

A caller SHALL be able to register a listener for changes and to remove it. After each change to the model, the core SHALL send the full new snapshot to each registered listener. The core SHALL NOT send a snapshot when the new model is equal to the current model.

#### Scenario: A change to the authored state

- **WHEN** a listener is registered and the title of the app bar changes from `Wishem` to `Wishem workbench`
- **THEN** the listener gets one snapshot that holds `Wishem workbench`

#### Scenario: A change to a definition

- **WHEN** a listener is registered and the label of a component type changes
- **THEN** the listener gets one snapshot that holds the new label

#### Scenario: A listener is removed

- **WHEN** a listener is removed, and then the model changes
- **THEN** that listener gets no snapshot, and the core continues

#### Scenario: A model that is equal

- **WHEN** the core gets a model that is equal to its current model
- **THEN** no listener gets a snapshot

### Requirement: A core holds only a correct model

A core SHALL NOT start with a model that is not correct. When a running core gets a model that is not correct, the core SHALL keep its current model, SHALL send no snapshot, and SHALL report the problems to the caller that gave the model.

#### Scenario: A model that is not correct at the start

- **WHEN** a core is made from a model in which an entity uses a component type that is not defined
- **THEN** no core is made, and the caller gets the problems

#### Scenario: A model that is not correct during a run

- **WHEN** a running core holds a correct model and gets a model that is not correct
- **THEN** the snapshot of the core does not change, no listener gets a snapshot, and the caller gets the problems

#### Scenario: A correct model after a model that is not correct

- **WHEN** a core refused a model, and then gets a correct model that is different from its current model
- **THEN** the core holds the new model and sends its snapshot

### Requirement: A core runs with no Node.js API

The core SHALL run in a web browser and in Node.js. The core SHALL NOT read a file, open a port, or use an API that only Node.js has.

#### Scenario: The core in a process with no file system

- **WHEN** a core is made from model data in an environment that has no file system
- **THEN** the core gives its snapshot and sends new snapshots
