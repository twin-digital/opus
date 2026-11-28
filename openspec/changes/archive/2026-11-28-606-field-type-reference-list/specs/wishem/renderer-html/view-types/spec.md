# Spec Delta

## MODIFIED Requirements

### Requirement: The type of a member follows the type of its field

The member of a `string`, `number`, or `boolean` field SHALL be a value of that TypeScript type or no value. The member of a `reference` field SHALL be a React node. The member of a `reference-list` field SHALL be a read-only list of React nodes or no value. The file SHALL import a type only when a member uses it.

#### Scenario: A component type with each field type

- **WHEN** the definition has the fields `Title` (`string`), `Points` (`number`), `Done` (`boolean`), `Next` (`reference`), and `Steps` (`reference-list`)
- **THEN** `Props` has `title: string | undefined`, `points: number | undefined`, `done: boolean | undefined`, `next: ReactNode`, and `steps: readonly ReactNode[] | undefined`

#### Scenario: A view that uses a number as text

- **WHEN** a view gives the prop `points` of a number field to a function that takes only a string
- **THEN** the type check of the package fails

#### Scenario: A list of references with no other reference

- **WHEN** the only field of the definition that is not a `string` has the type `reference-list`
- **THEN** the file imports the type `ReactNode` from `react`

### Requirement: The type Values gives the values that setField takes

The generated file SHALL export the type `Values`, with one read-only member for each field, under the name of its prop. The member of a `string`, `number`, or `boolean` field SHALL have that type, the member of a `reference` field SHALL be a string, the ID of an entity, and the member of a `reference-list` field SHALL be a read-only list of strings, the IDs of entities. The member `wishem` of `Props` SHALL take only these names and these types in `setField`.

#### Scenario: A value of the wrong type

- **WHEN** a view calls `wishem.setField('done', 'yes')`, and `done` is a boolean field
- **THEN** the type check of the package fails

#### Scenario: A name that the definition does not have

- **WHEN** a view calls `wishem.setField('colour', 'red')`, and no field gives the name `colour`
- **THEN** the type check of the package fails

#### Scenario: One ID for a list

- **WHEN** a view calls `wishem.setField('steps', 'e_00000000-0000-4000-8000-000000000000')`, and `steps` is a `reference-list` field
- **THEN** the type check of the package fails
