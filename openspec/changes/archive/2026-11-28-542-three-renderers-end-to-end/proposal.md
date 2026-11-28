---
issue: https://github.com/twin-digital/opus/issues/542
milestone: https://github.com/twin-digital/opus/milestone/19
---

# Proposal

## Why

The milestone `[WSH] A5 Renderers` has this outcome: "A PixiJS page and a Godot application draw the state of the same hub, and the picture changes when the clock advances." Now each renderer draws a construct of its own. The PixiJS page has its construct, the Godot application has a different construct with different IDs, and no React page draws a construct other than the workbench. No test proves that the three renderers draw one hub. This change gives the renderers one construct and one test from end to end. It is the last change of the milestone.

## What Changes

- The sample product gets the color behavior (**Proposed** term, from #617): a native behavior that sets the `color` field of each `Color` component to `COLORS[ticks % 4]` at each tick. The list `behaviors` of the sample product holds the count behavior and the color behavior.
- `startProductConstruct` of `construct-manager` gets the option `port`. The default stays 0. The construct manager does not change.
- A new private package `@thrashplay/wishem-three-renderers` (`nodejs/wishem/three-renderers`, **Proposed** name) holds:
  - The sample construct (**Proposed** term): one product construct of the sample product, with a clock of 500 milliseconds, in its own Node.js process. The command `construct` starts it with its link at `ws://127.0.0.1:4750/link`.
  - The React page (**Proposed** term): a page in a web browser that draws the sample construct through the link with the React renderer and the view `ClearColor`. The command `react-page` starts its page server on port 5175.
  - The test from end to end: it starts the sample construct, the React page, the PixiJS page, and the Godot application as real processes, and proves that each picture has the color of the same state of the hub, that each picture changes when the clock advances, and that each picture stays the same while the clock is paused.
- **BREAKING** (private package): `@thrashplay/wishem-pixi-page` holds no construct. Its `start` command starts only the page server. The option `--hub-port` gives the port of the construct that the page draws, with the default 4750. The option `--paused` is removed. The view `ClearColor` attaches to the component type `Color` of the sample product.
- **BREAKING** (private package): `@thrashplay/wishem-renderer-godot` holds no construct. The `start` command and the export `startGodotConstruct` are removed. The default of `--hub-port` of the command `godot` is 4750. The view `ClearColor` attaches to the component type `Color` of the sample product.
- The screenshot tests of the PixiJS page and of the Godot application start the sample construct in place of their own construct. Their steps and the PixiJS baselines do not change.
- The architecture document shows the sample construct process, the React page server, and the React page. The PixiJS process holds no construct, and the Godot process is removed.

## Capabilities

### New Capabilities

- `wishem/renderers/sample-construct`: the one construct that the three renderers draw: its process, its model, its behaviors, its clock, its command, the paused start, the port, and the stop.
- `wishem/renderers/end-to-end-test`: the test that runs the sample construct and the three renderers as real processes and checks the pictures of each renderer against the same state of the hub.
- `wishem/renderer-html/react-page`: the React page that draws the sample construct through the link, its status line, its page server, and its new link after a stop.

### Modified Capabilities

- `wishem/sample-product/model`: a tick sets the color of each `Color` component, and the list `behaviors` holds the count behavior and the color behavior.
- `wishem/workbench/construct-manager`: a product construct can serve its link on a given port.
- `wishem/renderer-pixi/construct`: each requirement is removed. The sample construct replaces the construct of the PixiJS page.
- `wishem/renderer-pixi/page`: the page draws the sample construct, the view attaches to the component type `Color`, a command starts only the page server, and the screenshot test starts the sample construct.
- `wishem/renderer-godot/construct`: each requirement is removed. The sample construct replaces the construct of the Godot application.
- `wishem/renderer-godot/application`: the default hub port is 4750, and the screenshot test starts the sample construct.
- `wishem/architecture/diagrams`: the container diagram shows the sample construct process, the React page server, and the React page, and no Godot process.

## Impact

- New: `nodejs/wishem/three-renderers/` (package, tests, README).
- `nodejs/wishem/sample-product/`: `src/color-behavior.ts` and its test, `src/index.ts`, `README.md`.
- `nodejs/wishem/construct-manager/`: `src/product-construct.ts` and its test, `README.md`.
- `nodejs/wishem/pixi-page/`: `src/construct/` is removed. `scripts/start.ts`, `src/start.test.ts`, `src/views/ClearColor.view.json`, `tests/`, `playwright.config.ts`, `package.json`, `README.md`.
- `nodejs/wishem/renderer-godot/`: `src/construct/` and `scripts/start.ts` are removed. `src/index.ts`, `src/runner/run-godot.ts`, `godot/main.gd`, `godot/views/ClearColor.view.json`, `tests/godot.ui.test.ts`, `package.json`, `README.md`.
- `nodejs/wishem/docs/`: `architecture/README.md`, `architecture/render.mjs` and the container SVG files, `glossary.md`, `milestones/a5-renderers/time-client.mjs`. Also `nodejs/wishem/CLAUDE.md`.
- `pnpm-lock.yaml` for the new package and the changed dependencies.
- A changeset for `three-renderers`, `sample-product`, `construct-manager`, `pixi-page`, and `renderer-godot`.
- The change builds on #617 (the update subsystem). Its apply starts after #617 is on `main`. It replaces #662. See "Order with other changes" in `design.md`.
