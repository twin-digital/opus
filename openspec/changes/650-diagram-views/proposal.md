---
issue: https://github.com/twin-digital/opus/issues/650
milestone: https://github.com/twin-digital/opus/milestone/18
---

# Proposal

## Why

The container diagram of Wishem shows each package of `nodejs/wishem/` as a container and each value import as a relationship. It has 18 boxes, and most arrows are "Builds on [import]". In the C4 model, a container is a unit that runs or holds data, and a library is code inside a container. The owner decided in #649 (option A) that Wishem has three views, each with one job.

## What Changes

- The container diagram of Wishem shows only the runtime units and the stores: the processes, the pages, the applications, and the model folders. It shows only the runtime relationships: HTTP, the link, the file system, Docker, and a start of a process. No library package is a container. Each card names the package that holds the unit. The table of the containers gives each package whose code runs in the unit.
- A new package dependency view (not C4) shows each package of `nodejs/wishem/` in its layer, with its dependencies. `render.mjs` makes it from the `package.json` files.
- `render.mjs --check` fails when an SVG file differs from the output of the script, when a package has no layer, when a dependency goes to a higher layer, or when the architecture document has no table row for a package.
- A new private package `@thrashplay/wishem-docs-check` runs the check in its tests. CI runs these tests, because the package has each other Wishem package as a development dependency.
- A new component diagram of the workbench process shows the start script, the workbench construct, the storage subsystems, the construct manager, the product constructs, the update subsystem, the product code, the Vite development server, and the generator of the view types.
- The component diagram of the page does not change.
- Each set of diagram instructions gives the new rule: `docs/diagrams.md`, `.claude/skills/diagrams/SKILL.md`, the root `CLAUDE.md`, `openspec/config.yaml`, `nodejs/wishem/docs/autonomous-flow.md`, and `nodejs/wishem/docs/README.md`. The owner gave the permission for the files outside `nodejs/wishem/` in #649.
- The final reviewer of a Wishem change compares the runtime units with the container diagram, and runs the check. The check replaces the comparison of the imports by hand.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wishem/architecture/diagrams`: the requirement "The container diagram" is removed, and "The container diagram of the runtime units" replaces it; new requirements for the package dependency view, its layers, its check, and the component diagram of the workbench process; the requirement of the render script gets the option `--check`.

## Impact

- `nodejs/wishem/docs/architecture/`: `render.mjs`, `README.md`, new files `packages-*.svg` and `components-workbench-process-*.svg`, and changed `containers-*.svg`.
- New package `nodejs/wishem/docs-check` (private, tests only), with an entry in the root `turbo.json` for the inputs of its test.
- `nodejs/wishem/CLAUDE.md`, `nodejs/wishem/docs/README.md`, `nodejs/wishem/docs/autonomous-flow.md`.
- Outside `nodejs/wishem/`, with the permission of #649: `docs/diagrams.md`, `.claude/skills/diagrams/SKILL.md`, the root `CLAUDE.md`, and `openspec/config.yaml`.
- No product code changes. No package is published.
- Two in-flight changes also change `render.mjs` and the architecture document: #542 (pull request #674) and #537 (pull request #673). `design.md` gives the order.
