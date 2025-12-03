# @twin-digital/repo-kit

## 0.2.0

### Minor Changes

- 22f58e3: update to nodejs v24.x and Typescript 5.9

### Patch Changes

- Updated dependencies [22f58e3]
  - @twin-digital/json-patch-x@0.1.0

## 0.1.1

### Patch Changes

- b5fa9b9: add support for hooks to run after file changes
- 700cee0: add support for "dependency" condition
  - @twin-digital/json-patch-x@0.0.1

## 0.1.0

### Minor Changes

- 3d5a613: change design so that feature config is provided by users

  Previously, there was one set of opinionated features baked into the library. Now,
  the repo must include a '.repo-kit.yml' file (with configurable path). This YAML
  file specifies the sets of features, and also which packages they apply to.

### Patch Changes

- 22d6324: update 'align-config' to correctly exclude declaration maps from packages
- 40500d6: format package.json via prettier-package-json when it is changed
- c7ec681: add 'typescript' configuration to sync command
- bf36ec4: add configuration option to disable 'eslintBootstrap' sync task
- a9b6381: fix align-config error when updating non-existing files and improved logs
- e8d4089: add support for sync plugins which require reinstalling npm dependencies
- Updated dependencies [f361b78]
- Updated dependencies [f830568]
  - @twin-digital/json-patch-x@0.0.1

## 0.0.3

### Patch Changes

- 5faa81c: update 'align-config' command to remove tsbuildinfo from excluded files
- e90007f: add initial version of 'align-config' command
- 2185ca5: update 'align-config' to only add exports for files that exist
- 40d53e5: update 'align-config' to only add dist entries to package.json files if there is a "src" folder

## 0.0.2

### Patch Changes

- 28fc4a8: fix crash when running via npx

## 0.0.1

### Patch Changes

- 8d4b8b0: publish initial version of tool
- d2f6064: add 'update-readme' command
