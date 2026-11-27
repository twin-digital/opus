# Spec Delta

## ADDED Requirements

### Requirement: The store runs with no Node.js API

The store and the validation of a model SHALL run in a web browser and in Node.js. They SHALL NOT read a file, open a port, or use an API that only Node.js has.

#### Scenario: The store in a process with no file system

- **WHEN** a hub with a store is made from model data in an environment that has no file system
- **THEN** the store gives its part and applies inputs

### Requirement: The checks of the repository keep Node.js APIs out of the core package

The source code of the package `@thrashplay/wishem-core`, without its test files, SHALL NOT import a Node.js module and SHALL NOT use a Node.js global. A check that runs in the pull request checks of the repository SHALL fail when the source code breaks this rule. A test file of the package MAY use a Node.js API.

#### Scenario: An import of a Node.js module with the node prefix

- **WHEN** a source file of the package has `import { readFileSync } from 'node:fs'`
- **THEN** the check fails and names the file

#### Scenario: An import of a Node.js module with no prefix

- **WHEN** a source file of the package has `import { join } from 'path'`
- **THEN** the check fails and names the file

#### Scenario: A Node.js global

- **WHEN** a source file of the package uses `process.env` or `Buffer`
- **THEN** the check fails and names the file

#### Scenario: A test file

- **WHEN** a test file of the package imports `node:fs`
- **THEN** the check passes
