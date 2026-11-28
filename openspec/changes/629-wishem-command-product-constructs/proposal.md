---
issue: https://github.com/twin-digital/opus/issues/629
milestone: https://github.com/twin-digital/opus/milestone/18
---

# Proposal

## Why

The `wishem` command of `host-nodejs` has no construct list and no construct manager. An agent or a designer who wants to run, pause, step, or stop a product construct must start the `start` script of `workbench-app`, which also starts a Vite development server and serves a page. The `wishem` command must run product constructs with no page, through the link of the hub only.

## What Changes

- With `--product`, the construct of `wishem start` holds the construct list (the part `constructs`), and the command attaches the construct manager. Each product construct runs in a product construct process (#628). The inputs `constructs/start`, `constructs/stop`, `constructs/send`, and `constructs/rewind` work through the link of the command, as in the workbench.
- New option `--product-code <module>`: the product code. The command checks it in a child process at the start, and each product construct process loads it. It needs `--product`. The usage line names it.
- The terminal shows the lines of the construct manager: `wishem: construct <id> runs in the process <pid>`, `wishem: construct <id> runs, link at <address>`, the lines of each product construct process, `stopped`, and `failed`.
- An interrupt signal stops each product construct before the construct of the command. A `SIGKILL` of the command leaves no product construct process.
- The `wishem` command moves from `host-nodejs` to a new private package `@thrashplay/wishem-command` (`nodejs/wishem/command`), which depends on `host-nodejs` and `construct-manager`. Reason: `construct-manager` depends on `host-nodejs`, so `host-nodejs` cannot import the construct manager. `workbench` gets the command from the new package, so `pnpm --filter @thrashplay/wishem-workbench exec wishem start ...` and the `start` script of `workbench` do not change.
- **BREAKING** (private package): `@thrashplay/wishem-host-nodejs` has no `bin`. It keeps `startConstruct`, `serveHub`, `readModelFolder`, and `format`.
- The architecture document: the Wishem command process starts, stops, and reaches the product construct processes; the package dependency view gets the package `command` in a new layer.
- With no `--product`, the command does not change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wishem/host-nodejs/cli`: the usage line names `--product-code`; with `--product`, the command runs the construct list and the construct manager; the option `--product-code` and its errors; the stop of the product constructs with the command.
- `wishem/architecture/diagrams`: the container diagram shows that the Wishem command process starts, stops, and reaches the product construct processes, and names the package `command`.

## Impact

- New package `nodejs/wishem/command` (`@thrashplay/wishem-command`, private): bin `wishem`, `src/cli.ts`, and the tests of the command, moved from `host-nodejs`, and new tests with real processes.
- `nodejs/wishem/host-nodejs`: removes `bin/`, `src/cli.ts`, `src/cli*.test.ts`, the `bin` field, and the section of the command in `README.md`.
- `nodejs/wishem/workbench`: the dependency `@thrashplay/wishem-command` for the bin; `README.md`.
- `nodejs/wishem/docs-check`: the development dependency `@thrashplay/wishem-command`.
- `turbo.json`: the entry `@thrashplay/wishem-host-nodejs#test` becomes `@thrashplay/wishem-command#test`, because the tests of the command start `dist/cli.js`.
- `nodejs/wishem/docs/architecture/README.md`, `render.mjs`, and the SVG files of the container diagram and the package dependency view; `glossary.md`, `concepts.md`, `nodejs/wishem/CLAUDE.md`, `docs/milestones/a1-construct.md` (the usage line); the root `README.md` package list; `pnpm-lock.yaml`.
- Depends on #628 (the product construct process, `childProcessLauncher`, `checkProductCode`). No new third-party dependency.
