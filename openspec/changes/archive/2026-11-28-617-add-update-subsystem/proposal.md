---
issue: https://github.com/twin-digital/opus/issues/617
milestone: https://github.com/twin-digital/opus/milestone/18
---

# Proposal

## Why

Rule R22 (**Agreed**, #602 question 2, option B) says that one model subsystem, the update subsystem, runs the behaviors of a tick. No part of Wishem has that job now. The count rule of the sample product (`withCountRule`) and the color rule of the PixiJS construct (`withColorRule`) each wrap the store by themselves, and no part owns the order between them. The next rule would copy the wrap. This change gives the update step one owner now, so that the behavior feature (#481) has the place where it attaches.

## What Changes

- A new private package `@thrashplay/wishem-update` (`nodejs/wishem/update`, **Proposed** name) holds the update subsystem. `createUpdate({ store, behaviors })` wraps the store one time. The result is a model subsystem with the ID of the store. It applies each input type of the store as the store does, and also `time/advance`.
- A native behavior is data and code: an ID, a component type, and a pure function `update(fields, tick)` that returns the new fields of one component. The tick gives `ms` (the delta), `ticks`, and `now` of the part `time`.
- At each tick, the update subsystem runs each behavior in the order of the list. For each behavior, it runs the behavior for each entity that has its component type, in the order of the entities in the store. It writes each changed field through the store. It keeps the same part object when no field changes. A behavior that throws, or a result that the store refuses, refuses the tick.
- **BREAKING** (private package): `@thrashplay/wishem-sample-product` exports `countBehavior` and the list `behaviors` in place of `withCountRule` and `wrapStore`.
- The PixiJS construct has the update subsystem with the color behavior (`colorBehavior`) in place of `withColorRule`.
- **BREAKING** (private packages): the product code that the workbench loads with `--product-code` exports the list `behaviors` in place of the function `wrapStore`. The construct manager makes the update subsystem of each product construct from that list. A product construct with no product code has the update subsystem with no behaviors.
- The architecture document shows the new container `update` and its relationships. The glossary, the concepts, and `nodejs/wishem/CLAUDE.md` describe the update subsystem as built.

## Capabilities

### New Capabilities

- `wishem/update/update-subsystem`: the update subsystem, the contract of a native behavior, the order of the behaviors in a tick, the result when nothing changes, the refusal of a tick, the record, and no Node.js API.

### Modified Capabilities

- `wishem/sample-product/model`: the count rule becomes the count behavior, a native behavior that the update subsystem runs. The root entry exports `behaviors` in place of `wrapStore`.
- `wishem/renderer-pixi/construct`: the color rule becomes the color behavior, which the update subsystem of the construct runs.
- `wishem/workbench/start`: the option `--product-code` names a module whose export `behaviors` is the list of native behaviors of the product.
- `wishem/workbench/construct-manager`: the store of a product construct is wrapped by the update subsystem with the behaviors of the product.
- `wishem/architecture/diagrams`: the container diagram shows the package `update` and the packages and processes that build on it.

## Impact

- New: `nodejs/wishem/update/` (package, tests, README).
- `nodejs/wishem/sample-product/`: `src/count-rule.ts` becomes `src/count-behavior.ts`, with its tests, `src/index.ts`, `src/readme-example.test.ts`, `README.md`, and `package.json`.
- `nodejs/wishem/pixi-page/`: `src/construct/color-rule.ts` becomes `src/construct/color-behavior.ts`, with its tests, `src/construct/create-hub.ts`, `README.md`, and `package.json`.
- `nodejs/wishem/construct-manager/` and `nodejs/wishem/workbench-app/scripts/start.ts`: the contract `wrapStore` becomes the list `behaviors`. These come from #538.
- `nodejs/wishem/docs/`: `architecture/README.md`, `architecture/render.mjs` and the container SVG files, `glossary.md`, `concepts.md`. Also `nodejs/wishem/CLAUDE.md`.
- `pnpm-lock.yaml` for the new package and the new dependencies.
- A changeset for `update`, `sample-product`, `pixi-page`, `construct-manager`, and `workbench-app`.
- The change builds on #538 (construct manager), which is on `main`. Its apply starts after #609 (the count is a number) is on `main`. See "Order with other changes" in `design.md`.
