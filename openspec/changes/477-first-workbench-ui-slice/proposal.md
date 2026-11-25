---
issue: https://github.com/twin-digital/opus/issues/477
milestone: https://github.com/twin-digital/opus/milestone/1
---

# Proposal

## Why

The workbench of Wishem is a model that is made with Wishem. [Core and host](https://github.com/twin-digital/opus/issues/476) built the core, the model folder, and the snapshot. [Workbench design system](https://github.com/twin-digital/opus/issues/496) builds the page package, the tokens, the app bar, and the zero state. Nothing draws the model on a screen yet.

This change is a tracer bullet. It draws one element, the app bar, from the definitions and the authored state of the workbench. It proves the path from a file on disk to a picture in a web browser before a later slice adds panels and tools.

## What Changes

- Add the first HTML renderer, as a folder of modules in `nodejs/wishem/workbench-app`. A **view** is code that changes one component of an entity into React elements. `defineView` declares a view, with the ID of its component type and the fields that it reads.
- Add the first view: the view of the component type `AppBar`. It uses the app bar of the component catalog.
- Change the workbench page. It connects to the core, draws each component that has a view, and draws again after each change to the model. The zero state stays as fixed content of the page.
- Add a client of the core for a web browser. The renderer gets the core as an object with the same read operations as a core in the same process.
- Add a read interface to `@thrashplay/wishem-core`: the read operations of a core, with no write operation.
- Add a `start` script to `workbench-app`. It starts the core of the workbench and the page in one command, and it stops them together.
- Add end-to-end tests of the page. They change the authored state file and check the picture. They run in the pinned web browser of [Workbench design system](https://github.com/twin-digital/opus/issues/496).
- Add architecture documents in `nodejs/wishem/docs/architecture/`, with SVG diagrams that use the Wishem brand.
- Update the blueprint: the text of rule R17, the glossary, and `concepts.md`.

Not in this change:

- A change to `@thrashplay/wishem-host-nodejs` or to `@thrashplay/wishem-workbench`.
- Panels, a way to change the authored state from the page, live state, steps, time, recorded inputs, rewind, interaction through the model, the agent, a second core, and a definitions API.
- A screenshot from the renderer (item 2 of the renderer contract), and tool overlays (item 4).
- A new component, a new token, or a new state in the component catalog.
- A package for the HTML renderer, and a page that is built to files for a release.

This change depends on [Workbench design system](https://github.com/twin-digital/opus/issues/496). That change must be merged and archived before the first task of this change starts.

## Capabilities

### New Capabilities

- `wishem/renderer-html/views`: how a view is declared, how a view is linked to its component type, how the views of a product are collected, which values a view gets, and what happens when a view and a definition are different.
- `wishem/renderer-html/page`: what the page draws from a snapshot, the order of the picture, the mark that gives the entity of an element, how the picture follows a change to the model, and what the page shows when it has no snapshot.
- `wishem/workbench/start`: the one command that starts the core of the workbench and its page, its options, what it prints, and how it stops.

### Modified Capabilities

- `wishem/core/snapshot`: adds a read interface of a core that has no write operation, so that a renderer gets the same object in the same process and through a connection.

## Impact

- `@thrashplay/wishem-workbench-app` (private): the renderer modules, the `AppBar` view, the client, the `start` script, the end-to-end tests, and new dependencies on `@thrashplay/wishem-core`, `@thrashplay/wishem-host-nodejs`, and `@thrashplay/wishem-workbench`.
- `@thrashplay/wishem-core` (private): one new exported type.
- `turbo.json`: the test tasks of `workbench-app` need the build of the packages that the `start` script imports.
- `nodejs/wishem/docs/rules.md`: rule R17 gets text about a renderer in a different process. See [the answer about rule R17](https://github.com/twin-digital/opus/issues/477#issuecomment-7167020144).
- `nodejs/wishem/docs/glossary.md`, `concepts.md`, and `README.md`: the terms and the rules for views, and a row for the architecture documents.
- `nodejs/wishem/docs/architecture/`: new documents and SVG files.
- `nodejs/wishem/CLAUDE.md`: the new role of `workbench-app`.
- The pull request checks: the job `ui-tests` also runs the end-to-end tests of the page.
