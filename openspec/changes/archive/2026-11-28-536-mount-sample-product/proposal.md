---
issue: https://github.com/twin-digital/opus/issues/536
milestone: https://github.com/twin-digital/opus/milestone/18
---

# Proposal

## Why

The workbench construct holds only the authored model of the workbench now. The milestone "A4 Workbench and product" needs a product whose authored model the workbench holds and keeps, so that the workbench can list and change it (#537), and so that the construct manager can give it to product constructs (#538, #539). The test with three renderers (#542) also needs a small product whose picture changes when the clock advances.

## What Changes

- A new private package `@thrashplay/wishem-sample-product` in `nodejs/wishem/sample-product`. Its `model/` folder holds two component types, `Color` and `Counter`, and one entity with a `Color` component and a `Counter` component. Its root entry gives the IDs of the model and the count rule: a model subsystem that wraps a store and adds 1 to each count on each tick. The package uses no Node.js API.
- The workbench construct can mount a product. The product model is a second store with the ID `product` in the workbench construct. The store `store` keeps the authored model of the workbench. The two stores validate their models apart, so the product model cannot refer to a thing of the workbench.
- The storage subsystem keeps each of the two models in its own model folder. Each one follows the hand edits of its own folder, writes its own `state.json`, and holds its own write while its definitions differ from its files. A rewind restores the two stores, and each storage subsystem writes its own file.
- `wishem start <folder> --product <folder>` and the `start` script of the workbench page (`--product <folder>`) name the product folder to mount. With no `--product`, the construct has no part `product`, as now.
- The terminal names the product folder and its counts at the start. Each other line about the product model names the product.
- Two corrections of the clock from #561: the declarations of the timer functions move into `clock.ts`, so that a package with no Node.js types can read the source of the clock, and the clock measures the real time again from the `started` event of the hub.
- The architecture document shows the product model folder as a second store of persisted data. The glossary and the concepts describe what a mount is in data.
- The page of the workbench does not change. #537 adds the panel that lists the things of the product.

## Capabilities

### New Capabilities

- `wishem/workbench/mount`: the mount of a product in the workbench construct: the second store `product`, the separation of the two models, the two model folders, and a rewind of the two stores.
- `wishem/sample-product/model`: the model of the sample product, its fixed IDs, the count rule, and the limits of the package.

### Modified Capabilities

- `wishem/host-nodejs/model-folder`: the storage subsystem keeps one store, named by its ID, and the storage of a mounted product names the product in each line.
- `wishem/host-nodejs/cli`: the option `--product <folder>` of `wishem start`, its lines, and its errors.
- `wishem/workbench/start`: the option `--product <folder>` of the `start` script of the workbench page.
- `wishem/clock/time`: the clock measures the real time from the start of the hub, and its source compiles with no Node.js types.
- `wishem/architecture/diagrams`: the container diagram shows the product model folder, and the entity diagram applies to each model folder.

## Impact

- New package: `nodejs/wishem/sample-product` (depends on `@thrashplay/wishem-core` and `@thrashplay/wishem-hub`; the tests use `@thrashplay/wishem-clock`).
- `nodejs/wishem/host-nodejs`: `model-folder-storage.ts`, `start-construct.ts`, `cli.ts`, `index.ts`, the README, and their tests.
- `nodejs/wishem/workbench-app`: `scripts/start.ts`, `src/start.test.ts`, and the README.
- `nodejs/wishem/clock`: `src/clock.ts`, `src/globals.d.ts` (removed), and the tests.
- Documents: `nodejs/wishem/docs/architecture/` (README, `render.mjs`, the SVG files of the container diagram and of the entity diagram), `glossary.md`, `concepts.md`, the usage line in `milestones/a1-construct.md`, and the list of packages in `nodejs/wishem/CLAUDE.md`.
- `pnpm-lock.yaml`, the root `README.md` package list, and the changeset.
- No change to the link protocol, the hub, the store, or the page.
