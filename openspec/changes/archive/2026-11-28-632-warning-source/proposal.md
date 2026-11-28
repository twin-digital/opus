---
issue: https://github.com/twin-digital/opus/issues/632
milestone: https://github.com/twin-digital/opus/milestone/18
---

# Proposal

## Why

The warning of `validateModel` for two component types with the same label has the path `["definitions"]` and no index. Thus the storage subsystem of `host-nodejs` cannot name the definition file, and the designer does not know which file to change. The code in `host-nodejs` that makes the source of a warning absolute cannot run, and three mutants of the break-test #619 survived (S17, S18, C4).

## What Changes

- `validateModel` (`core`) gives each warning for a duplicate label the path `["definitions", <index>, "label"]`. The index is the index of the later of the two component types in the list `definitions`.
- The terminal line of such a warning names the definition file: `wishem: warning in definitions/<file>.json: …` for the model folder, and the absolute path of the file for the product folder. A warning of the product no longer has the prefix `wishem: product: warning:`, because the absolute path names the product.
- The `generate` script of `workbench-app` names the definition file in the line of a model warning. It uses the same `withSource` function, so its code does not change.
- New tests in `core`, `host-nodejs`, and `workbench-app` for the path, the relative source, the absolute source, and a real `wishem start` process.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wishem/core/model`: the requirement "Component types with the same label" gives the path of the warning.
- `wishem/host-nodejs/model-folder`: the requirement "A problem names its file" also covers a warning, and the requirement "Each line about the product model names the product" gets a scenario for a warning of a product file.

## Impact

- Code: `nodejs/wishem/core/src/validate-model.ts` (the path of the warning). No source change in `host-nodejs` or `workbench-app`; their existing code for a warning with a source runs.
- Tests: `core/src/validate-model.test.ts`, `host-nodejs/src/model-folder-storage.test.ts`, `host-nodejs/src/start-construct.test.ts`, a new `host-nodejs/src/cli.guide.test.ts`, and `workbench-app/src/generate.test.ts`.
- Docs: `nodejs/wishem/core/README.md`.
- Terminal output: the text of the warning line changes. No program reads the text or the path of a model warning. The renderers and the workbench page do not get model warnings.
