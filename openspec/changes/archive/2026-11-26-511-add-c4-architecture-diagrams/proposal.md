---
issue: https://github.com/twin-digital/opus/issues/511
milestone: https://github.com/twin-digital/opus/milestone/1
---

# Proposal

## Why

The architecture document of Wishem was made before [`docs/diagrams.md`](../../../docs/diagrams.md), the guidance for diagrams. Its two diagrams are not in C4 notation. It has no system context diagram and no entity diagram of the model folder, and no specification names its diagrams. Thus a later change to the architecture has no rule that makes it change a diagram.

## What Changes

- Add a system context diagram, a container diagram, a dynamic diagram of the path of a change, a component diagram of the page, and an entity diagram of the model folder to `nodejs/wishem/docs/architecture/`.
- Remove the diagrams "The processes of the workbench" and "From a file to a picture". The container diagram, the dynamic diagram, and the component diagram hold their content.
- Extend `render.mjs` for the C4 notation and for an entity diagram. It writes each diagram in a light file and a dark file from one description.
- Write the architecture document again in the form of the guidance: for each diagram a heading, the diagram, the prose, and a table of the elements.
- Add a specification that names each diagram.

Not in this change:

- A change to a package. The code of Wishem does not change.
- A change to the architecture. No element and no relationship is new, moved, or removed.
- A shared library for diagrams. Each product has its own render script.

This change builds on [Views of a component type](https://github.com/twin-digital/opus/issues/501). The component diagram of the page shows the sidecars that issue adds. That change must be merged and archived before the first task of this change starts.

## Capabilities

### New Capabilities

- `wishem/architecture/diagrams`: the diagrams that the architecture document of Wishem must hold: the system context diagram, the container diagram, the dynamic diagram of the path of a change, the component diagram of the page, and the entity diagram of the model folder.

### Modified Capabilities

None.

## Impact

- `nodejs/wishem/docs/architecture/README.md`: the document in the form of the guidance.
- `nodejs/wishem/docs/architecture/render.mjs`: the C4 notation, the entity notation, and the descriptions of the five diagrams.
- `nodejs/wishem/docs/architecture/`: ten new SVG files, and the removal of the four SVG files that exist.
- `nodejs/wishem/docs/README.md`: the row for the architecture document, if its text is not correct.
- No package changes, so the changeset is empty.
