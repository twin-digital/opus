---
issue: https://github.com/twin-digital/opus/issues/628
milestone: https://github.com/twin-digital/opus/milestone/18
---

# Proposal

## Why

The construct manager (#538) runs each product construct in the Node.js process of the workbench. A fault of the product code, such as an endless loop or a call of `process.exit`, then stops the workbench. The workbench process also loads the product code one time, so a new version of the code does not run until the workbench starts again. Behavior prompts (#481) replace the code of a product while the workbench runs, so each product construct must run in a process of its own.

## What Changes

- Each product construct runs in a **product construct process** (**Proposed** term): a Node.js child process of the workbench process. The construct manager starts and stops it.
- The construct manager reaches the hub of each product construct through a link. The link uses the link protocol over the IPC channel of the child process. The ports `construct-manager` and `construct-manager-reader` of a product construct are on that link, so a client of the WebSocket link cannot use these IDs.
- The product construct process loads the product code. The workbench process never loads it. Each start of a product construct loads the code again, so a stop and a start run the current code.
- A fault of a product construct does not stop the workbench. When the process ends, does not answer in 5 seconds, or does not start in 10 seconds, the construct manager reports the status `failed` with a message, and ends the process.
- A product construct process ends when the workbench process ends, also when the workbench process gets `SIGKILL`.
- The terminal shows the process ID of each product construct process, and each line that the product construct process writes, with the ID of the construct.
- The `start` script of the workbench checks the product code in a short child process, not in its own process. The lines and the exit codes of the check do not change.
- **BREAKING** (private package): `attachConstructManager` takes the option `launch` in place of `behaviors`, `stepMs`, `timer`, and `now`. `childProcessLauncher` is the default. `inProcessLauncher` runs a product construct in the same process, for tests with a fake clock.
- The architecture document gets the product construct process as a container, and the component diagram of the workbench process loses the product constructs and the update subsystem.
- Part of #685: the failed start of a product construct closes its clock port, and the doc comment of `close` is correct.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wishem/workbench/construct-manager`: a product construct runs in a child process; the construct manager reaches it through a link on the IPC channel; the faults of a product construct process; the product code loads in each new process; no process stays after the workbench.
- `wishem/workbench/start`: the option `--product-code` checks the module in a child process, and the workbench process does not run the product code.
- `wishem/architecture/diagrams`: the container diagram shows the product construct process; the component diagram of the workbench process shows the launcher in place of the product constructs and the update subsystem.

## Impact

- `nodejs/wishem/construct-manager`: new `src/ipc-channel.ts`, `src/product-construct-process.ts` (the entry of the child process), `src/launchers.ts`; changes to `src/construct-manager.ts`, `src/product-construct.ts`, `src/node.ts`, the tests, and `README.md`.
- `nodejs/wishem/workbench-app`: `scripts/start.ts`, a new test of the test guide, and `README.md`.
- `turbo.json`: the entry `@thrashplay/wishem-construct-manager#test` builds the package first, because the tests start `dist/product-construct-process.js`.
- `nodejs/wishem/docs/architecture/README.md`, `render.mjs`, and the SVG files of the container diagram and of the component diagram of the workbench process.
- `nodejs/wishem/docs/glossary.md`, `concepts.md`, and `nodejs/wishem/CLAUDE.md`.
- No new dependency. `three-renderers` keeps `startProductConstruct` with no change.
