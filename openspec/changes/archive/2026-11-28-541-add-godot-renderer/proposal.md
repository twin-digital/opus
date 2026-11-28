---
issue: https://github.com/twin-digital/opus/issues/541
milestone: https://github.com/twin-digital/opus/milestone/19
---

# Proposal

## Why

Rule R17 says that three renderers use the same TypeScript hub, and that a renderer in a different language, such as Godot, reaches the hub through a link. Rule R7 gives the Godot renderer an exception: it is built before a product needs it. Only TypeScript clients of the link exist now. A Godot application that draws a construct in a Node.js process is the proof that the link and its document serve a client in a different language. The test with three renderers ([#542](https://github.com/twin-digital/opus/issues/542)) needs this renderer.

## What Changes

- A new private package `@thrashplay/wishem-renderer-godot` in `nodejs/wishem/renderer-godot`. It holds a Godot project (Godot 4.7.2) with a remote port in GDScript, the Godot renderer, and one view.
- The remote port in GDScript opens a link with its subsystems, keeps the joined state, gives the three operations of a port, and opens a new link after each end. It is written from `LINK.md` only.
- One kind of view, the Godot view (sidecar kind `godot`). The first view, `ClearColor`, fills the viewport with the color that a field gives.
- A construct of its own in a Node.js process: a hub with the store, the `time` subsystem, the clock, and a rule that sets the color of one entity from the count of ticks. The command `pnpm --filter @thrashplay/wishem-renderer-godot start` starts it on port 4749. The option `--paused` starts the time paused.
- Godot runs in a Docker container, with a virtual display and software rendering. The command `pnpm --filter @thrashplay/wishem-renderer-godot godot` starts the Godot application. The application connects to the construct through the link, and writes a screenshot each time the picture changes. The command carries the bytes of the link between the container and the computer of the construct, so that it works with a local and with a remote Docker daemon.
- A screenshot test with no window (`test:ui`) runs the real construct and the real Godot application. It proves that the picture changes when the clock advances, and that Godot connects again after the construct stops and starts.
- `LINK.md` gets the corrections that the GDScript client needs: the address of the link, the kind of WebSocket message, the size of a message, the JSON numbers, and the status values of `welcome`.
- The architecture document shows the Godot application, the Godot process, the Godot runner, and their relationships.

## Capabilities

### New Capabilities

- `wishem/renderer-godot/remote-port`: the remote port in GDScript: the hello, the joined state, the events, the inputs and their results, the order checks, and the connection again after a link ends.
- `wishem/renderer-godot/renderer`: the Godot renderer: how it reads a port, how a Godot view and its sidecar attach to a component type, the props of a view, the `ClearColor` view, the entity at a point, and the stop.
- `wishem/renderer-godot/construct`: the construct of the Godot application in a Node.js process: the model in code, the color rule, the clock, the link on port 4749, the start command and its options, and the stop.
- `wishem/renderer-godot/application`: the Godot application in Docker: the image, the runner command, the path of the link from the container, the screenshots, the lines in the terminal, the connection again, and the screenshot test.

### Modified Capabilities

- `wishem/hub/link`: the document of the protocol gives the address of the link, the kind of WebSocket message, the size of a message, the JSON numbers, and the status values that a client can get.
- `wishem/architecture/diagrams`: the container diagram shows the Godot application, the Godot process, and the Godot runner, and their relationships.

## Impact

- New package `@thrashplay/wishem-renderer-godot`. It depends on `@thrashplay/wishem-core`, `@thrashplay/wishem-hub`, `@thrashplay/wishem-clock`, and `@thrashplay/wishem-host-nodejs`. It uses `serveHub` of `host-nodejs`, which change #540 adds. It has Vitest tests, GDScript tests, and a screenshot test. The GDScript tests and the screenshot test need Docker.
- `pngjs` in the catalog of `pnpm-workspace.yaml`, for the screenshot test. New entries in `pnpm-lock.yaml`, in the package list of the root `README.md`, in `turbo.json` (the task `test:ui` of this package), and in `.gitignore` (the cache of Godot and the screenshots of this package).
- `@thrashplay/wishem-hub`: `LINK.md` only. No change to the code of `core`, `hub`, `clock`, or `host-nodejs`.
- Documents: `nodejs/wishem/CLAUDE.md`, `nodejs/wishem/docs/concepts.md` ("Processes and links" and "The three renderers"), `nodejs/wishem/docs/glossary.md` (the term "Godot view"), `nodejs/wishem/docs/architecture/` (`README.md`, `render.mjs`, and the SVG files of the container diagram), and a program `time-client.mjs` for the test guide in `nodejs/wishem/docs/milestones/a5-renderers/`.
- The pull request job `ui-tests` runs `turbo run test:ui --affected`, so it runs the screenshot test of this package when the package changes. The job builds the Godot image on the runner. No workflow file changes.
- Not in this change: the test with three renderers on one hub (#542), an input subsystem in the Godot application, a Godot window on the screen of a person, and an export of the Godot project.
