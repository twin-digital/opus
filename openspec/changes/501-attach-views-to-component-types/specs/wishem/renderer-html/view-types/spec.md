# Spec Delta

## Purpose

Defines the generated types of the props of a React view: what the generator writes for each sidecar, how a prop gets its name from the label of a field, how a person runs the generator, and how the files stay current.

## ADDED Requirements

### Requirement: The generator writes the types of the props of each view

For each sidecar of the kind `react` in a `views` folder, the generator SHALL write one TypeScript file beside the sidecar. The file of `<name>.view.json` SHALL be `<name>.view.gen.ts`. The file SHALL export one type, `Props`, with one read-only member for each field in the definition of the component type of the sidecar. The type of the member of a `string` field SHALL be a string or no value. The generator SHALL get the definitions from the model folder.

#### Scenario: The types of the app bar

- **WHEN** the generator runs for `AppBar.view.json` and the definition of its component type has one `string` field with the label `title`
- **THEN** `AppBar.view.gen.ts` exports a type `Props` whose member `title` is a string or no value

#### Scenario: A view that uses a prop that the definition does not have

- **WHEN** a view reads a prop that the generated `Props` type does not have
- **THEN** the type check of the package fails

#### Scenario: A sidecar is removed

- **WHEN** the generator runs and `Header.view.gen.ts` exists with no `Header.view.json`
- **THEN** the generator removes `Header.view.gen.ts`

### Requirement: The name of a prop comes from the label of its field

The generator and the renderer SHALL use one rule to get the name of a prop from the label of a field. The rule SHALL divide the label into words at each run of characters that are not ASCII letters or digits. The first character of the first word SHALL become lower case. The first character of each later word SHALL become upper case. The other characters SHALL NOT change. The name SHALL be the words with no separator.

#### Scenario: A label of one word

- **WHEN** the label of a field is `title`
- **THEN** the name of the prop is `title`

#### Scenario: A label of two words

- **WHEN** the label of a field is `Max health`
- **THEN** the name of the prop is `maxHealth`

#### Scenario: A label that has the form of a name

- **WHEN** the label of a field is `maxHealth`
- **THEN** the name of the prop is `maxHealth`

### Requirement: A label that gives no usable name is an error of the generator

The generator SHALL report an error, and SHALL write no file for that sidecar, in each of these cases: the label of a field gives an empty name, the label of a field gives a name that starts with a digit, or two fields of one component type give the same name. The error SHALL name the sidecar file, the component type ID, and the field IDs.

#### Scenario: Two labels that give the same name

- **WHEN** a component type has the fields `Max health` and `max-health`, and a sidecar names that component type
- **THEN** the generator reports one error that names the sidecar file and the two field IDs

#### Scenario: A label that starts with a digit

- **WHEN** the label of a field is `2nd line`
- **THEN** the generator reports an error that names the field ID

### Requirement: A sidecar whose component type has no definition gets an empty type

When a sidecar names a component type that no definition has, the generator SHALL write a `Props` type with no member and SHALL give a warning that names the sidecar file and the ID. This SHALL NOT be an error.

#### Scenario: A sidecar before its definition

- **WHEN** a person adds `Header.view.json` for a component type that has no definition file, and runs the generator
- **THEN** `Header.view.gen.ts` exports a `Props` type with no member, the command prints a warning, and the exit code is 0

### Requirement: A command runs the generator

The package of the workbench page SHALL have a `generate` script. The script SHALL write the files for the model folder of the base workbench and the `views` folder of the package. The script SHALL print one line for each file that it wrote, changed, or removed, and SHALL print nothing for a file that did not change. When the model folder is not correct, or the generator reports an error, the script SHALL print each problem and SHALL stop with a non-zero exit code.

#### Scenario: Nothing changed

- **WHEN** a person runs the `generate` script and each generated file is current
- **THEN** the command changes no file, prints that the files are current, and stops with exit code 0

#### Scenario: A field was added to a definition

- **WHEN** a person adds a field with the label `subtitle` to the definition of `AppBar` and runs the `generate` script
- **THEN** `AppBar.view.gen.ts` has the member `subtitle`, and the command prints the name of the file

#### Scenario: The model folder is not correct

- **WHEN** a definition file is not valid JSON and a person runs the `generate` script
- **THEN** the command prints the problem with the name of the file, changes no generated file, and stops with a non-zero exit code

### Requirement: The command can check that the files are current

With the option `--check`, the `generate` script SHALL change no file. It SHALL stop with exit code 0 when each generated file is current. In each other case it SHALL print each file that is not current and SHALL stop with a non-zero exit code. The generated files SHALL be in the repository, and the tests of the package SHALL fail when a generated file is not current.

#### Scenario: A definition changed and the generator did not run

- **WHEN** a person changes the label of a field in a definition file and runs the `generate` script with `--check`
- **THEN** the command names the generated file that is not current, changes no file, and stops with a non-zero exit code

#### Scenario: The tests find a file that is not current

- **WHEN** a generated file in the repository does not agree with the definitions and the sidecars
- **THEN** a test of the package fails and names the file

### Requirement: The start script keeps the generated files current

While the `start` script of the workbench runs, the generated files of the `views` folder of the package SHALL follow the model that the core holds. The script SHALL run the generator when it starts, after each change to the definitions that the core accepts, and after each change to a sidecar. For each prop name that is new or removed, the script SHALL print one line that names the generated file and the prop. An error of the generator SHALL be printed, and SHALL NOT stop the script. The script SHALL have an option that turns this off.

#### Scenario: A label changes while the workbench runs

- **WHEN** the workbench runs and a person changes the label of the field `title` to `heading` in the definition file
- **THEN** `AppBar.view.gen.ts` has the member `heading` and no member `title`, and the terminal has a line that names the file and the two props

#### Scenario: A change to the authored state

- **WHEN** the workbench runs and a person changes a title in `state.json`
- **THEN** no generated file changes and the terminal has no line about the generated files

#### Scenario: The option is off

- **WHEN** a person starts the workbench with the option that turns the generator off, and changes a label in a definition file
- **THEN** no generated file changes
