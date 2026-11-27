# Spec Delta

## MODIFIED Requirements

### Requirement: The start script keeps the generated files current

While the `start` script of the workbench runs, the generated files of the `views` folder of the package SHALL follow the model that the core holds. The script SHALL run the generator when it starts, after each change to the definitions that the core accepts, and after each change to a sidecar. A rewind that changes the definitions SHALL be such a change. The script SHALL have an option that turns this off.

#### Scenario: A label changes while the workbench runs

- **WHEN** the workbench runs and a person changes the label of the field `title` to `heading` in the definition file
- **THEN** `AppBar.view.gen.ts` has the member `heading` and no member `title`

#### Scenario: A sidecar is added while the workbench runs

- **WHEN** the workbench runs and a person adds a sidecar for a component type that has a definition
- **THEN** the generated file of that sidecar exists

#### Scenario: A change to the authored state

- **WHEN** the workbench runs and a person changes a title in `state.json`
- **THEN** no generated file changes and the terminal has no line about the generated files

#### Scenario: The option is off

- **WHEN** a person starts the workbench with the option that turns the generator off, and changes a label in a definition file
- **THEN** no generated file changes

#### Scenario: A rewind before a change of a label

- **WHEN** the workbench runs, a person changes the label of the field `title` to `heading`, and then an input subsystem sends `hub/rewind` with the sequence number before that change
- **THEN** `AppBar.view.gen.ts` has the member `title` and no member `heading`
