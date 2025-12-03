# @twin-digital/tsconfig

## 0.2.0

### Minor Changes

- 22f58e3: update tsconfig to include everything for linting & specific build override
- 22f58e3: update to nodejs v24.x and Typescript 5.9

### Patch Changes

- 22f58e3: change library to ESNext

  This grants support for the new Iterable helpers.

- 8d56808: update configuration to support jsx

## 0.1.1

### Patch Changes

- b5fa9b9: initial publish of package from new repository

## 0.1.0

### Minor Changes

- 0120313: update config to abandon use of project references:
  - remove composite flag
  - add 'noEmit' flag
  - remove 'tsBuildInfoFile' option

- cb9da5d: update build options to emit declarations and declaration maps

### Patch Changes

- 9122192: fix: correctly include tsconfig files in published package
- 2671ba3: add 'preserveWatchOutput' option
