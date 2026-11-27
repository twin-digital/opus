---
issue: https://github.com/twin-digital/opus/issues/531
milestone: https://github.com/twin-digital/opus/milestone/15
---

# Proposal

## Why

The hub (#528), the store (#529), and the link (#530) exist, but no process uses them. The workbench still runs on `createCore` and sends snapshots over Server-Sent Events. The architecture of [#527](https://github.com/twin-digital/opus/issues/527) says that the workbench is a construct: a hub, the store, a storage subsystem for files, and a page that connects through a link. This change makes the workbench run in that form, so that the later results of the milestone (the clock, views that send inputs, a mounted product) build on one construct.

## What Changes

- **BREAKING** `@thrashplay/wishem-host-nodejs`: `startConstruct` replaces `startHost`. One Node.js process holds a hub with the store, the storage subsystem for files, and a WebSocket server for the link. `Construct` and `ConstructOptions` replace `Host` and `HostOptions`.
- The storage subsystem for files has two attached subsystems. The input subsystem `files` watches the model folder and sends `store/replace-model` after a change. The output subsystem `files-writer` writes `state.json` when the entities of the store change. It writes no definition file.
- **BREAKING** The server serves the link at `ws://127.0.0.1:4747/link`. It refuses a connection from a page of a different site. `GET /snapshot` and `GET /snapshots` are removed. Each other request gets status 404.
- The `wishem start` command prints the address of the link.
- The page of the workbench connects through a remote port as an output subsystem with a unique ID. When the link ends, the page keeps its picture and connects again with a growing delay.
- **BREAKING** The `start` script of `workbench-app` uses `startConstruct`. The option `--hub-port` replaces `--core-port`. The page server passes `/link` to the hub and nothing else.
- **BREAKING** `@thrashplay/wishem-core`: `createCore`, `Core`, and `CoreReader` are removed. The model types, `validateModel`, `ModelError`, and the store stay.
- The architecture document and its container, dynamic, and component diagrams show the hub package, the link, and the write to the model folder.

No user interface changes. The page draws the same picture, so the style guide and its screenshots do not change.

## Capabilities

### New Capabilities

None. The requirements that stay from `wishem/core/snapshot` move to `wishem/core/store`, which [#529](https://github.com/twin-digital/opus/issues/529) adds.

### Modified Capabilities

- `wishem/host-nodejs/server`: the link at `/link`, the check of the origin, status 404 for each other request. The snapshot paths are removed.
- `wishem/host-nodejs/model-folder`: the storage subsystem sends the model to the store, and writes `state.json` after a change of the entities.
- `wishem/host-nodejs/cli`: the command starts a construct and prints the address of the link.
- `wishem/core/snapshot`: each requirement is removed. The rules for Node.js APIs move to `wishem/core/store`.
- `wishem/core/store`: the store runs with no Node.js API, and a check keeps Node.js APIs out of the package.
- `wishem/renderer-html/page`: the page reads the store part through a remote port, and connects again after the link ends.
- `wishem/workbench/start`: the script starts a construct, passes the link, and has the option `--hub-port`.
- `wishem/architecture/diagrams`: the container, dynamic, and component diagrams show the link and the hub package.

## Impact

- Code: `nodejs/wishem/host-nodejs/` (all of `src/`, `README.md`), `nodejs/wishem/workbench/` (`src/start.test.ts`, `README.md`), `nodejs/wishem/workbench-app/` (`scripts/start.ts`, `scripts/e2e-server.ts`, `src/main.tsx`, `src/Page.tsx`, `src/renderer/`, `src/start.test.ts`, `tests/workbench.spec.ts`, `README.md`), `nodejs/wishem/core/` (`src/core.ts` removed, `README.md`).
- Documents: `nodejs/wishem/docs/architecture/` (`README.md`, `render.mjs`, the SVG files), `nodejs/wishem/docs/glossary.md` (the lines that name `createCore` and `startHost` as current code), `nodejs/wishem/CLAUDE.md` (the package list).
- Dependencies: `ws` and `@types/ws` in the catalog of `pnpm-workspace.yaml`. `host-nodejs` gets `@thrashplay/wishem-hub` and `ws`. `workbench-app` and `workbench` get `@thrashplay/wishem-hub`.
- Not in this change: the new names of the packages and of the specifications ([#518](https://github.com/twin-digital/opus/issues/518)), a mounted product ([#536](https://github.com/twin-digital/opus/issues/536)), views that send inputs ([#535](https://github.com/twin-digital/opus/issues/535)), the renderer as a package of its own ([#534](https://github.com/twin-digital/opus/issues/534)), and the clock.
