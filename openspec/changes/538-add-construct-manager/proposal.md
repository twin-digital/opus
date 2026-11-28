---
issue: https://github.com/twin-digital/opus/issues/538
milestone: https://github.com/twin-digital/opus/milestone/18
---

# Proposal

## Why

The workbench construct mounts a product now (#536), but nothing runs the product. The milestone "A4 Workbench and product" needs a part of the workbench that starts and stops the constructs of the product, gives each one the product model, and passes inputs to it, so that the workbench can run, pause, step, and rewind the product (#539) and show each change of the authored state in the running product.

## What Changes

- A new private package `@thrashplay/wishem-construct-manager` in `nodejs/wishem/construct-manager`.
  - Its root entry uses no Node.js API. It holds the **construct list**: a model subsystem of the workbench construct with the ID `constructs`. Its part holds each product construct that must run, and the status that the construct manager reported for it. Its inputs are `constructs/start`, `constructs/stop`, `constructs/send`, and `constructs/report`.
  - Its entry `node` holds the **construct manager**. It attaches one input subsystem and one output subsystem to the workbench hub. It reads the construct list, and it starts and stops each product construct in the process of the workbench.
- A product construct has a hub of its own with the `time` subsystem, the store `store` (wrapped by the rules of the product, when the product has rules), and a clock. It has no storage subsystem, so it writes no file. Its link is served on `127.0.0.1` on a port that the system selects, so that a renderer in a different process can draw it.
- The store of a product construct starts from the product model at the start. After the start, the construct manager sends each change of the product model as inputs: one `store/set-field` for each changed field value, or one `store/replace-model` for each other change.
- `constructs/send` passes an input to a running product construct: a write to the live state, a time input (pause, run, step), or `hub/rewind`. The construct manager reports the result in the construct list.
- The hub gets the option `rewindSources`. A product construct accepts `hub/rewind` only from the construct manager. A rewind through the product link gets the reason `not-permitted`.
- `startConstruct` of `host-nodejs` gets the option `subsystems`: more model subsystems after the stores.
- The `start` script of the workbench page gets the option `--product-code <module>`: the module of the product rules. With a mounted product, the script adds the construct list and attaches the construct manager. The sample product exports its rules as `wrapStore`.
- The architecture document shows the new package and its relationships. The glossary and the concepts describe the construct list, the construct manager, and a product construct.
- The page of the workbench does not change. #539 adds the controls and the page of a product construct.

## Capabilities

### New Capabilities

- `wishem/workbench/construct-list`: the model subsystem `constructs` of the workbench construct: its part, its four inputs, and what it refuses.
- `wishem/workbench/construct-manager`: the construct manager: the start and the stop of a product construct, what a product construct holds, the feed of the product model, the pass of inputs, the reports, the rewind permission, and the stop with the workbench.

### Modified Capabilities

- `wishem/hub/record`: a hub can limit the subsystems that send `hub/rewind`.
- `wishem/workbench/start`: the option `--product-code`, and the construct manager in the workbench that the script starts.
- `wishem/sample-product/model`: the root entry exports the rules of the product as `wrapStore`.
- `wishem/architecture/diagrams`: the container diagram shows the package `construct-manager` and its relationships.

## Impact

- New package: `nodejs/wishem/construct-manager` (depends on `@thrashplay/wishem-core`, `@thrashplay/wishem-hub`, `@thrashplay/wishem-clock`, and `@thrashplay/wishem-host-nodejs`).
- `nodejs/wishem/hub`: `src/hub.ts`, `src/types.ts`, the README, and the tests (the option `rewindSources`).
- `nodejs/wishem/host-nodejs`: `src/start-construct.ts`, the README, and the tests (the option `subsystems`).
- `nodejs/wishem/sample-product`: `src/index.ts`, the README, and a test (the export `wrapStore`).
- `nodejs/wishem/workbench-app`: `scripts/start.ts`, `src/start.test.ts`, `package.json`, and the README.
- Documents: `nodejs/wishem/docs/architecture/` (README, `render.mjs`, and the SVG files of the container diagram), `glossary.md`, `concepts.md`, and the list of packages in `nodejs/wishem/CLAUDE.md`.
- `pnpm-lock.yaml`, the root `README.md` package list, and the changesets.
- This change needs `serveHub` of #540. See "What this change needs from #540 and #535" in `design.md`.
- No change to the link protocol, the store, the clock, the `wishem` command, or the page.
