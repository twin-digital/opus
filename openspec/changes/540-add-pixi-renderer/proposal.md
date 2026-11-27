---
issue: https://github.com/twin-digital/opus/issues/540
milestone: https://github.com/twin-digital/opus/milestone/19
---

# Proposal

## Why

Rule R17 says that three renderers use the same TypeScript hub, and rule R7 gives the PixiJS renderer an exception: it is built before a product needs it. Only the React renderer exists now. A second renderer in a different library, which reads a construct in a Node.js process through the link, is the proof that the hub, the link, and the view system do not depend on React. The owner decided on 2026-11-27 that for the MVP the hub is always in a Node.js process, so each renderer must work through the link. The test with three renderers ([#542](https://github.com/twin-digital/opus/issues/542)) needs this renderer.

## What Changes

- A new private package `@thrashplay/wishem-renderer-pixi` in `nodejs/wishem/renderer-pixi`. It draws PixiJS views from a port. It reads only through `read` and `subscribe`. It sends no input, and it does not close the port.
- One kind of view, the PixiJS view (sidecar kind `pixi`). A PixiJS view makes one display object and sets it from its props. A sidecar attaches the view to its component type, as for a React view. The view gets one prop for each field, with the name that the label gives.
- The renderer gives the entity and the component type at a point of the viewport.
- A new function `serveHub` in `@thrashplay/wishem-host-nodejs`: a Node.js program serves the link of a hub that it made. `startConstruct` uses it. The construct manager ([#538](https://github.com/twin-digital/opus/issues/538)) and the Godot renderer ([#541](https://github.com/twin-digital/opus/issues/541)) can use it too.
- A new function `connectLink` in `@thrashplay/wishem-hub`: a client opens a link with its subsystems and opens a new link after each end. `connectHub` of the workbench page uses it, with no change that a person sees.
- A new private package `@thrashplay/wishem-pixi-page` in `nodejs/wishem/pixi-page`. It holds a construct of its own: a hub in a Node.js process with the store, the `time` subsystem, the clock, and a rule that sets the color of one entity from the count of ticks. It also holds a page that connects to that process through the link. The page draws the construct with the PixiJS renderer, and its keys pause, run, and step the construct through an input subsystem of the link. The page connects again after the process stops and starts, and a status line shows the state of the link.
- The command `pnpm --filter @thrashplay/wishem-pixi-page start` starts the construct and the page server, and stops them together. The option `--paused` starts the time of the construct paused.
- A screenshot test in a web browser with no window (the pinned Playwright image in Docker) runs the real process and the real page. It proves that a step through the link changes the picture and that the picture stays the same while the construct is paused.
- The architecture document shows the new containers. `concepts.md` records the rule of the owner: the hub is in a Node.js process.

## Capabilities

### New Capabilities

- `wishem/renderer-pixi/renderer`: the PixiJS renderer package: how it reads a port, how a PixiJS view and its sidecar attach to a component type, the props of a view, the order of the display objects, the entity at a point, and the stop.
- `wishem/renderer-pixi/construct`: the construct of the PixiJS page and its Node.js process: the model in code, the color rule, the clock, the link, the start command and its options, and the stop.
- `wishem/renderer-pixi/page`: the PixiJS page: its link to the construct, the `ClearColor` view, the keys, the status of the link, the connection again after a stop, and the screenshot test.

### Modified Capabilities

- `wishem/host-nodejs/server`: a program can serve the link of a hub that it made, with the same rules of the server.
- `wishem/hub/link`: a client of the link opens a new link after each end.
- `wishem/architecture/diagrams`: the container diagram shows the PixiJS page, the PixiJS process, and the packages `renderer-pixi` and `clock`.

## Impact

- New package `@thrashplay/wishem-renderer-pixi`. It depends on `@thrashplay/wishem-core` and `@thrashplay/wishem-hub` for types only, and has `pixi.js` as a peer dependency.
- New package `@thrashplay/wishem-pixi-page`. It depends on `core`, `hub`, `clock`, `host-nodejs`, `renderer-pixi`, and `pixi.js`. It has a Vite page, a Node.js start script, Vitest tests, and Playwright tests that need Docker.
- `host-nodejs`: new `src/serve-hub.ts`, and `src/start-construct.ts` uses it. `hub`: new `src/link/connect-link.ts`, and a section of `LINK.md`. `workbench-app`: `src/hub-client.ts` uses `connectLink`.
- `pixi.js` `^8.23.0` in the catalog of `pnpm-workspace.yaml`. New entries in `pnpm-lock.yaml` and in the package list of the root `README.md`.
- Documents: `nodejs/wishem/CLAUDE.md`, `nodejs/wishem/docs/concepts.md` ("Distribution" and "The three renderers"), `nodejs/wishem/docs/glossary.md` (the term "PixiJS view"), and `nodejs/wishem/docs/architecture/` (`README.md`, `render.mjs`, and the SVG files of the container diagram).
- No change to the code of `core` and `clock`, and no change that a person sees in the workbench page.
- Not in this change: the test with three renderers on one hub (#542), and the Godot renderer (#541).
