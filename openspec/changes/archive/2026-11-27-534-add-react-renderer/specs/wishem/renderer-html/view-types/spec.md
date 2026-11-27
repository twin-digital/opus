# Spec Delta

## ADDED Requirements

### Requirement: The generator is a part of the React renderer package

The generator SHALL be a part of the React renderer package, in the entry `@thrashplay/wishem-renderer-react/view-types`. The caller SHALL give the definitions, the `views` folder, and the command that writes the files again. The generator SHALL read no model folder. The header of each generated file SHALL name the command that the caller gives.

#### Scenario: The command of the workbench

- **WHEN** the `generate` script of the workbench page writes `AppBar.view.gen.ts`
- **THEN** the header of the file names `pnpm --filter @thrashplay/wishem-workbench-app generate`

#### Scenario: A product gives its own command

- **WHEN** a caller gives the command `pnpm --filter my-product generate`
- **THEN** the header of each file that the generator writes names `pnpm --filter my-product generate`

## MODIFIED Requirements

### Requirement: The generator writes the types of the props of each view

For each sidecar of the kind `react` in a `views` folder, the generator SHALL write one TypeScript file beside the sidecar. The file of `<name>.view.json` SHALL be `<name>.view.gen.ts`. The file SHALL export one type, `Props`, with one read-only member for each field in the definition of the component type of the sidecar. The type of the member of a `string` field SHALL be a string or no value. The `generate` script SHALL get the definitions from the model folder.

#### Scenario: The types of the app bar

- **WHEN** the generator runs for `AppBar.view.json` and the definition of its component type has one `string` field with the label `title`
- **THEN** `AppBar.view.gen.ts` exports a type `Props` whose member `title` is a string or no value

#### Scenario: A view that uses a prop that the definition does not have

- **WHEN** a view reads a prop that the generated `Props` type does not have
- **THEN** the type check of the package fails

#### Scenario: A sidecar is removed

- **WHEN** the generator runs and `Header.view.gen.ts` exists with no `Header.view.json`
- **THEN** the generator removes `Header.view.gen.ts`
