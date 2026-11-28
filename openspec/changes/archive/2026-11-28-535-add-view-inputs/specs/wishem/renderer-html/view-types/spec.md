# Spec Delta

## MODIFIED Requirements

### Requirement: The generator writes the types of the props of each view

For each sidecar of the kind `react` in a `views` folder, the generator SHALL write one TypeScript file beside the sidecar. The file of `<name>.view.json` SHALL be `<name>.view.gen.ts`. The file SHALL export the type `Props`, with one read-only member for each field in the definition, and the member `wishem`. The `generate` script SHALL get the definitions from the model folder.

#### Scenario: The types of the app bar

- **WHEN** the generator runs for `AppBar.view.json` and the definition of its component type has one `string` field with the label `title`
- **THEN** `AppBar.view.gen.ts` exports a type `Props` whose member `title` is a string or no value, and whose member `wishem` takes the values of the type `Values`

#### Scenario: A view that uses a prop that the definition does not have

- **WHEN** a view reads a prop that the generated `Props` type does not have
- **THEN** the type check of the package fails

#### Scenario: A sidecar is removed

- **WHEN** the generator runs and `Header.view.gen.ts` exists with no `Header.view.json`
- **THEN** the generator removes `Header.view.gen.ts`

### Requirement: A label that gives no usable name is an error of the generator

The generator SHALL report an error, and SHALL write no file for that sidecar, in each of these cases: the label of a field gives an empty name, a name that starts with a digit, or a reserved name (`wishem` or `key`), or two fields of one component type give the same name. The error SHALL name the sidecar file, the component type ID, and the field IDs.

#### Scenario: Two labels that give the same name

- **WHEN** a component type has the fields `Max health` and `max-health`, and a sidecar names that component type
- **THEN** the generator reports one error that names the sidecar file and the two field IDs

#### Scenario: A label that starts with a digit

- **WHEN** the label of a field is `2nd line`
- **THEN** the generator reports an error that names the field ID

#### Scenario: A label that gives a reserved name

- **WHEN** the label of a field is `Wishem`
- **THEN** the generator reports an error that names the sidecar file, the field ID, and the name `wishem`, and it writes no file for that sidecar

### Requirement: A sidecar whose component type has no definition gets an empty type

When a sidecar names a component type that no definition has, the generator SHALL write a `Props` type whose only member is `wishem`, and a `Values` type with no member, and SHALL give a warning that names the sidecar file and the ID. This SHALL NOT be an error.

#### Scenario: A sidecar before its definition

- **WHEN** a person adds `Header.view.json` for a component type that has no definition file, and runs the generator
- **THEN** `Header.view.gen.ts` exports a `Props` type with only the member `wishem`, the command prints a warning, and the exit code is 0

## ADDED Requirements

### Requirement: The type of a member follows the type of its field

The member of a `string`, `number`, or `boolean` field SHALL be a value of that TypeScript type or no value. The member of a `reference` field SHALL be a React node. The file SHALL import a type only when a member uses it.

#### Scenario: A component type with each field type

- **WHEN** the definition has the fields `Title` (`string`), `Points` (`number`), `Done` (`boolean`), and `Next` (`reference`)
- **THEN** `Props` has `title: string | undefined`, `points: number | undefined`, `done: boolean | undefined`, and `next: ReactNode`

#### Scenario: A view that uses a number as text

- **WHEN** a view gives the prop `points` of a number field to a function that takes only a string
- **THEN** the type check of the package fails

### Requirement: The type Values gives the values that setField takes

The generated file SHALL export the type `Values`, with one read-only member for each field, under the name of its prop. The member of a `string`, `number`, or `boolean` field SHALL have that type, and the member of a `reference` field SHALL be a string, the ID of an entity. The member `wishem` of `Props` SHALL take only these names and these types in `setField`.

#### Scenario: A value of the wrong type

- **WHEN** a view calls `wishem.setField('done', 'yes')`, and `done` is a boolean field
- **THEN** the type check of the package fails

#### Scenario: A name that the definition does not have

- **WHEN** a view calls `wishem.setField('colour', 'red')`, and no field gives the name `colour`
- **THEN** the type check of the package fails
