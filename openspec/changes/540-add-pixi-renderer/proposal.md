---
issue: https://github.com/twin-digital/opus/issues/540
milestone: https://github.com/twin-digital/opus/milestone/19
---

# Proposal

## Why

Rule R17 says that three renderers use the same TypeScript hub, and rule R7 gives the PixiJS renderer an exception: it is built before a product needs it. Only the React renderer exists now. A second renderer in a different library is the proof that the hub, the port, and the view system do not depend on React. The test from end to end of the three renderers ([#542](https://github.com/twin-digital/opus/issues/542)) needs this renderer.

## What Changes

- A new private package `@thrashplay/wishem-renderer-pixi` in `nodejs/wishem/renderer-pixi`. It draws PixiJS views from a port. It reads only through `read` and `subscribe`. It sends no input, and it does not close the port.
- One kind of view, the PixiJS view (sidecar kind `pixi`). A PixiJS view makes one display object and sets it from its props. A sidecar attaches the view to its component type, as for a React view. The view gets one prop for each field, with the name that the label gives.
- The renderer gives the entity and the component type at a point of the viewport.
- A new private package `@thrashplay/wishem-pixi-page` in `nodejs/wishem/pixi-page`. It is a page that holds a construct: the store, the `time` subsystem, and the clock. The page has one view, `ClearColor`, which fills the viewport with the color that a field gives. A rule of the page sets that field from the count of ticks, so the picture changes when the clock advances.
- The keys of the page pause, resume, and step the construct. The command `pnpm --filter @thrashplay/wishem-pixi-page start` serves the page.
- A screenshot test in a web browser with no window (the pinned Playwright image in Docker) proves that the picture changes after a tick and stays the same while the construct is paused.
- The architecture document shows the new containers.

## Capabilities

### New Capabilities

- `wishem/renderer-pixi/renderer`: the PixiJS renderer package: how it reads a port, how a PixiJS view and its sidecar attach to a component type, the props of a view, the order of the display objects, the entity at a point, and the stop.
- `wishem/renderer-pixi/page`: the PixiJS page: its construct with a clock, the `ClearColor` view, the color rule, the keys, the start command, and the screenshot test.

### Modified Capabilities

- `wishem/architecture/diagrams`: the container diagram shows the PixiJS page, its server, and the packages `renderer-pixi` and `clock`.

## Impact

- New package `@thrashplay/wishem-renderer-pixi`. It depends on `@thrashplay/wishem-core` and `@thrashplay/wishem-hub` for types only, and has `pixi.js` as a peer dependency.
- New package `@thrashplay/wishem-pixi-page`. It depends on `core`, `hub`, `clock`, `renderer-pixi`, and `pixi.js`. It has a Vite page, Vitest tests, and Playwright tests that need Docker.
- `pixi.js` `^8.23.0` in the catalog of `pnpm-workspace.yaml`. New entries in `pnpm-lock.yaml` and in the package list of the root `README.md`.
- Documents: `nodejs/wishem/CLAUDE.md`, `nodejs/wishem/docs/concepts.md` ("The three renderers"), `nodejs/wishem/docs/glossary.md` (the term "PixiJS view"), and `nodejs/wishem/docs/architecture/` (`README.md`, `render.mjs`, and the SVG files of the container diagram).
- No change to the workbench page, to `workbench-app`, or to the code of `hub`, `core`, `clock`, and `host-nodejs`.
- Not in this change: a PixiJS page that connects to a hub in a different process, and the test with three renderers on one hub ([#542](https://github.com/twin-digital/opus/issues/542)); the Godot renderer ([#541](https://github.com/twin-digital/opus/issues/541)).
