---
issue: https://github.com/twin-digital/opus/issues/534
milestone: https://github.com/twin-digital/opus/milestone/17
---

# Proposal

## Why

The HTML renderer is a folder of modules in `workbench-app`. Only the page of the workbench can use it, and it reads a model reader that only the client of the page gives. The architecture in [#527](https://github.com/twin-digital/opus/issues/527) makes the React renderer a package that each page can use, and that reads the joined state through a port. A product page, the next change of the view system ([#535](https://github.com/twin-digital/opus/issues/535)), and the two other renderers ([#540](https://github.com/twin-digital/opus/issues/540), [#541](https://github.com/twin-digital/opus/issues/541)) need this base.

## What Changes

- A new private package `@thrashplay/wishem-renderer-react` in `nodejs/wishem/renderer-react`. It holds the renderer, the table of views, the parser of a sidecar, the rule for the names of props, the view warnings, and the generator of the prop types.
- The renderer reads the joined state through a port. A direct port of a hub in the same process and a remote port of a link give the same picture. The renderer only reads: it sends no input, and it does not attach or close the port.
- The generator is a separate entry of the package, `@thrashplay/wishem-renderer-react/view-types`, that runs in Node.js. The caller gives the definitions, the folder of views, and the command that the header of each generated file names.
- `workbench-app` uses the package. The page gives the port of each new link to the renderer. The views, the sidecars, the `generate` script, and the `start` script stay in `workbench-app`. The generated file `AppBar.view.gen.ts` does not change.
- The specifications `wishem/renderer-html/*` and the architecture document name the package. A new capability `wishem/renderer-html/renderer` holds the contract of the package.
- The person sees no change in the workbench page or in the terminal.

## Capabilities

### New Capabilities

- `wishem/renderer-html/renderer`: the React renderer package: what it draws from a port, how the picture follows the part `store`, the mark of each drawn element, and what the renderer does not do.

### Modified Capabilities

- `wishem/renderer-html/page`: the requirement "Each drawn element gives its entity" moves to `wishem/renderer-html/renderer`.
- `wishem/renderer-html/views`: the table of views is a part of the React renderer package, and the product gives it the sidecars and the view files.
- `wishem/renderer-html/view-types`: the generator is a part of the React renderer package, and the caller gives the definitions and the command of the header.
- `wishem/architecture/diagrams`: the container diagram shows the package `renderer-react`, and the component diagram of the page shows which parts come from it.

## Impact

- New package `@thrashplay/wishem-renderer-react`. It depends on `@thrashplay/wishem-core` and `@thrashplay/wishem-hub` for types only, and has `react` as a peer dependency. New entries in `pnpm-lock.yaml` and in the package list of the root `README.md`.
- `@thrashplay/wishem-workbench-app`: `src/renderer/` is removed. `connectHub` gives the port of each link. `Page` takes a port. `scripts/view-types.ts` and `scripts/view-types-report.ts` use the package. `scripts/start.ts` does not change.
- Documents: `nodejs/wishem/CLAUDE.md`, `nodejs/wishem/docs/concepts.md` (one line), `nodejs/wishem/docs/architecture/` (README, `render.mjs`, and the SVG files of two diagrams), `nodejs/wishem/workbench-app/README.md`, and the new `nodejs/wishem/renderer-react/README.md`.
- Not in this change: inputs from a view, more field types, and nested views ([#535](https://github.com/twin-digital/opus/issues/535)); the PixiJS and Godot renderers ([#540](https://github.com/twin-digital/opus/issues/540), [#541](https://github.com/twin-digital/opus/issues/541)).
