# Spec Delta

## ADDED Requirements

### Requirement: The read operations of a core are an interface of their own

The core package SHALL declare a read interface that has only the two read operations of a core: get the current snapshot, and register a listener for each new snapshot. The read interface SHALL have no operation that changes the model. A core SHALL satisfy the read interface with no adapter. Code that only reads a model, such as a renderer, SHALL be able to depend on the read interface and not on the full core.

#### Scenario: A core is given to code that reads

- **WHEN** a core is given to code that accepts the read interface
- **THEN** the code gets the current snapshot and each new snapshot, and it has no operation to change the model

#### Scenario: A different source of snapshots

- **WHEN** an object that is not a core gives the two read operations, for example a client of a core in a different process
- **THEN** code that accepts the read interface works with that object and needs no change
