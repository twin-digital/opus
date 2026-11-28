---
issue: https://github.com/twin-digital/opus/issues/539
milestone: https://github.com/twin-digital/opus/milestone/18
---

# Proposal

## Why

The designer cannot run the product from the workbench page. The construct manager (#538) starts, stops, and controls product constructs through inputs, but the page has no control for them. The page also does not show what a running product construct draws. This change gives the page the controls and a picture of the product construct. It is the last outcome of the milestone `[WSH] A4 Workbench and product`.

## What Changes

- The workbench page gets the **run controls** (**Proposed** term): Run, Stop, Pause, Resume, Step, and Step back for the product construct `play`, with its status, its tick, and its time. Each control is one input to the workbench construct.
- The workbench page gets the **stage** (**Proposed** term): the picture of the product construct `play`. The page opens a link to the product construct and draws its part `store` with the React renderer and the React views of the product.
- The page address carries the link of each product construct, at `/constructs/<id>/link`.
- The `start` script of the workbench page gets the option `--product-views <folder>`. The page loads the React views of the product from that folder.
- The sample product gets React views in `views/react/`: `ClearColor` (a box in the color of the `Color` component) and `Count` (the count of the `Counter` component as text).
- The construct list gets the input `constructs/rewind`. It steps a product construct back by a number of ticks. The construct manager keeps the pause and the changes of the authored state after the target.
- The `time` subsystem can hold the step length (`stepMs`) in its part. A product construct puts its step length in its part, so that a step from a control has the same length as a tick of the clock (#561).
- A change of the authored state shows on the stage, because the construct manager sends it to the product construct (#538).
- The architecture document shows the new components of the page and the links of the product constructs through the page server.

## Capabilities

### New Capabilities

- `wishem/workbench/run-controls`: the controls of the product construct `play` in the workbench page, the inputs that they send, their states, and the result of a control.
- `wishem/workbench/stage`: the picture of a product construct in the workbench page: the link to the product construct, the React views of the product, and the states of the stage.

### Modified Capabilities

- `wishem/clock/time`: the part `time` can hold the step length.
- `wishem/workbench/construct-list`: the new input `constructs/rewind`.
- `wishem/workbench/construct-manager`: the part `time` of a product construct holds its step length, and the construct manager does a `constructs/rewind`.
- `wishem/workbench/start`: the page address carries the link of each product construct, and the option `--product-views`.
- `wishem/sample-product/model`: the sample product has React views.
- `wishem/design-system/component-catalog`: the button, the run bar, and the stage.
- `wishem/architecture/diagrams`: the component diagram of the page shows the run controls, the stage, and the views of the product.

## Impact

- `nodejs/wishem/clock/`: `src/time.ts`, its tests, `README.md`.
- `nodejs/wishem/construct-manager/`: `src/construct-list.ts`, `src/construct-manager.ts`, `src/product-construct.ts`, their tests, `README.md`.
- `nodejs/wishem/sample-product/`: new `views/react/`, `package.json`, the configuration of its type check, lint, and tests, `README.md`.
- `nodejs/wishem/workbench-app/`: `scripts/start.ts`, `scripts/e2e-server.ts`, `src/Page.tsx`, `src/main.tsx`, new `src/tools/RunTool.tsx` and `src/tools/` helpers, new catalog components, the style guide, `playwright.config.ts`, new `tests/run.guide.spec.ts`, new `src/start.guide.test.ts`, `README.md`.
- `nodejs/wishem/docs/`: `architecture/README.md`, `architecture/render.mjs` and the SVG files of the page, `glossary.md`, `concepts.md`, `milestones/a4-workbench/page-driver.mjs`. Also `nodejs/wishem/CLAUDE.md`.
- `.gitignore`: the folders of the new e2e server, in `nodejs/wishem/workbench-app/`.
- `pnpm-lock.yaml`: the new development dependencies of `sample-product`.
- The change builds on the page of #537. Its apply starts after #537 is on `main`. See "Order with other changes" in `design.md`.
