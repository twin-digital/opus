# Wishem

Wishem is a just-in-time game development environment, assembled by an agent that lives inside your game and makes what you describe. The designer talks to the agent while the product runs. The agent builds and changes the product through the model of the product.

The `docs/` folder holds the blueprint.

## Packages

- `core` (`@thrashplay/wishem-core`): the model types, the validation, `isEqual`, and the store. `core` uses no Node.js API. `pnpm build --filter @thrashplay/wishem-core` fails when a source file of `core` uses one.
- `hub` (`@thrashplay/wishem-hub`): the hub, the ports, the record, and the link. It uses no Node.js API.
- `clock` (`@thrashplay/wishem-clock`): the `time` subsystem and the clock. It uses no Node.js API.
- `update` (`@thrashplay/wishem-update`): the update subsystem. It runs the native behaviors of a product in each tick. It uses no Node.js API. It is private.
- `sample-product` (`@thrashplay/wishem-sample-product`): the sample product. It holds a model folder with a color and a count, two native behaviors (the count behavior adds 1 to the count at each tick, and the color behavior sets the next of four colors), and React views of the color and the count in `views/react/`. The root entry uses no Node.js API and no view.
- `host-nodejs` (`@thrashplay/wishem-host-nodejs`): runs a construct in a Node.js process, serves the link (`startConstruct` and `serveHub`), and writes `state.json`.
- `command` (`@thrashplay/wishem-command`): the `wishem` command (bin `wishem`, `src/cli.ts`). It starts a construct for a model folder with `startConstruct`. It has no public API of code (`exports` has only the entries that `pnpm sync` writes). It is private.
- `construct-manager` (`@thrashplay/wishem-construct-manager`): the construct list (the model subsystem `constructs`) and `productChanges`. The entry `node` holds the construct manager, the launchers (`childProcessLauncher` starts each product construct in a product construct process, `inProcessLauncher` is for tests), `checkProductCode`, and the product construct. The root entry uses no Node.js API. It is private.
- `workbench` (`@thrashplay/wishem-workbench`): the base workbench. It holds the first model and a `start` script.
- `renderer-react` (`@thrashplay/wishem-renderer-react`): the React renderer. It draws React views from a port of the hub, and it writes the types of the props of the views. The root entry runs in a web browser. The entry `view-types` runs in Node.js.
- `renderer-pixi` (`@thrashplay/wishem-renderer-pixi`): the PixiJS renderer. It draws PixiJS views from a port. It uses no Node.js API.
- `pixi-page` (`@thrashplay/wishem-pixi-page`): a page that draws the sample construct through the link, and a `start` script that serves the page and passes its link to the sample construct. It holds no construct. It is private.
- `renderer-godot` (`@thrashplay/wishem-renderer-godot`): the Godot renderer. It holds the remote port in GDScript, the renderer, the Godot application that draws the sample construct, and the Godot runner. It holds no construct. Its GDScript tests and its screenshot test need Docker. It is private.
- `three-renderers` (`@thrashplay/wishem-three-renderers`): the sample construct, a product construct of the sample product in a Node.js process, and its command `construct`, and the React page with its page server and its command `react-page`. It is private.
- `workbench-app` (`@thrashplay/wishem-workbench-app`): the browser application of the workbench. It holds the page, the client of the hub, the views, the run controls and the stage for the product construct, the `start` script of the workbench, and the style guide with its screenshot tests, which need Docker.
- `docs-check` (`@thrashplay/wishem-docs-check`): tests that the architecture document agrees with the packages. They run `docs/architecture/render.mjs --check`. It is private.

## Read before you design or build

1. `docs/README.md`: the status labels and what to read for each task.
2. `docs/rules.md`: the rules that every part of Wishem obeys, with the reason for each rule and the alternatives that were rejected.
3. `docs/glossary.md`: the exact terms to use.
4. `docs/brand.md`: before you design a user interface or write what the agent says to the designer.

## Rules for each agent

These rules apply to each agent, and also to a subagent that has only a brief.

- Change files only in `nodejs/wishem/`, `openspec/changes/`, `openspec/specs/wishem/`, `.changeset/`, `pnpm-lock.yaml`, the catalog in `pnpm-workspace.yaml`, and the Wishem entries of `.repo-kit.yml`. A change in a different place needs the permission of the owner.
- Run lint, a type check, a test, or a build only when your brief tells you to. These commands use much memory, so they run in a small number of slots. Run each one from the root of your worktree in a slot: `node nodejs/wishem/docs/flow-scripts/heavy.mjs <command>`. If the script gives up with exit code 75 (each slot is busy), try the same command again, at most 40 times. Each other exit code is the result of the command. If the command ends with exit code 124, or you do not get the lock in 40 tries, stop and report it with the output of `lslocks`.
- Run them only for the packages that you changed, with a turbo filter.
- Do no background work: no command in the background, no monitor, and no wait for a later event. Run a long job in the foreground, in parts that each end in less than 150 seconds.
- Write no file to a place that other agents share, such as the scratchpad of the session or `/tmp`. Write your scripts and your results in `.superpowers/` of your own worktree. Give a report file the extension `.txt`.
- For a break-test, follow `docs/break-test-rules.md`.
- Do not run the pre-commit hook or the pre-push hook. Commit and push with `--no-verify`.
- Each new package is private. Do not publish to npm.

## Autonomous work

When the owner tells you to work with little help, you are the lead agent. Read `docs/autonomous-flow.md` before you do anything else. That file replaces two items of "How to work": you do not confirm a **Proposed** item with the owner, and you can change a rule in `docs/rules.md`. It tells you when to ask the owner.

## How to work

- Plan each change as an OpenSpec change. Start from the GitHub issue of the change. `docs/roadmap.md` gives the milestones and their issues.
- Record each thing that is not settled in the GitHub issue of its topic. If the topic has no issue, create one with the label `app:wishem`. The blueprint has no list of open questions. To find the issues, use the label `app:wishem` or the [Wishem project](https://github.com/orgs/twin-digital/projects/5).
- A specification in `openspec/specs/wishem/` overrides the blueprint on the same topic.
- Only text marked **Agreed** is settled. Text with no label has no status. Do not treat an item marked **Proposed** as a requirement. Confirm it with the owner in the change that depends on it.
- When a change settles a **Proposed** or **Open** item, update the blueprint in the same change.
- A design that breaks a rule in `docs/rules.md` needs the agreement of the owner and a change to the rule first.
- Before you propose a change, read the lines that start with "Rejected:" in `docs/rules.md`.
- A block quote that starts with `**Wishem:**` is an aside. It is never a requirement. To write one, follow `docs/README.md` and `docs/brand.md`.
