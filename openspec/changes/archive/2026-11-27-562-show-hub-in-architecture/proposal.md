---
issue: https://github.com/twin-digital/opus/issues/562
milestone: https://github.com/twin-digital/opus/milestone/15
---

# Proposal

## Why

The architecture document of Wishem must show each container. A package that other packages build on is a container. `@thrashplay/wishem-core` depends on `@thrashplay/wishem-hub` because the store of `core` is a model subsystem of the hub. The document does not show the hub package or that relationship, so the container diagram is not correct.

## What Changes

- The container diagram shows the container `hub` [Container: TypeScript package] and the relationship "core builds on hub [import]".
- The table of containers has a row for `hub`: the hub of a construct, the ports, the record of inputs, the joined state, and the hub events.
- The row of `core` in the table says that `core` also holds the store.
- The text under the table names the package dependencies of each package, with `core` on `hub`.
- The list of specifications of the document links to `wishem/core/store` and `wishem/hub/construct`.
- The `alt` text of the container diagram and the `desc` text of the SVG files say that Wishem has six containers and that `core` builds on `hub`.
- The render script writes the two SVG files of the container diagram again. The other diagrams do not change. The dynamic diagram and the component diagram show the running workbench, and the running workbench does not use the hub.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wishem/architecture/diagrams`: the requirement of the container diagram gets a scenario that ties it to the hub package and to the relationship from `core` to `hub`.

## Impact

- Documents: `nodejs/wishem/docs/architecture/README.md`, `nodejs/wishem/docs/architecture/render.mjs`, `nodejs/wishem/docs/architecture/containers-light.svg`, and `nodejs/wishem/docs/architecture/containers-dark.svg`.
- Specification: `openspec/specs/wishem/architecture/diagrams/spec.md` (at archive).
- Package code: none. The changeset is empty.
- Not in this change: the package `clock` ([#536](https://github.com/twin-digital/opus/issues/536) adds it), and the WebSocket link, the storage subsystem, and the removal of `createCore` ([#531](https://github.com/twin-digital/opus/issues/531)).
