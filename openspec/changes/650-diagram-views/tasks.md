# Tasks

Each task starts with its tests. Run lint, the type check, and the tests only for `@thrashplay/wishem-docs-check`, under `flock -w 15 /tmp/wishem-heavy.lock timeout 140 <command>`. The rest of the work is documents and `render.mjs`, which `node` runs with no build. Follow the `diagrams` skill for each diagram: look at a rendered image of each changed diagram in each theme (this needs Docker), and run `check-svg.mjs` on each light file with its dark file.

## Task 1: The package dependency view and its check

Files: `nodejs/wishem/docs/architecture/render.mjs`, `nodejs/wishem/docs/architecture/README.md`, new `nodejs/wishem/docs/architecture/packages-light.svg` and `packages-dark.svg`, new package `nodejs/wishem/docs-check/` (`package.json`, `README.md`, `src/index.ts`, `src/architecture.test.ts`, and the files that `pnpm sync` writes), `turbo.json` (one entry), `pnpm-lock.yaml`, `nodejs/wishem/CLAUDE.md`, `.changeset/650-diagram-views.md`
Interfaces: produces the command `node render.mjs [--check] [--packages <folder>] [--out <folder>]` (design Decision 5), the layers (Decision 4), and the exports `renderScript` and `architectureFolder` of `@thrashplay/wishem-docs-check` (design "Interfaces"). Tasks 2 and 3 use `--check` and the tests.

- [x] 1.1 Create the package `nodejs/wishem/docs-check` (`@thrashplay/wishem-docs-check`, private, `type: module`, description "Tests that the architecture document of Wishem agrees with the packages."), with each other package of `nodejs/wishem/` in `devDependencies` as `workspace:*`. Write `src/index.ts` with `renderScript` and `architectureFolder`. Run `pnpm install` and `pnpm sync`. Verify that `pnpm exec turbo ls --filter "...@thrashplay/wishem-hub"` lists `@thrashplay/wishem-docs-check`.
- [x] 1.2 Write the tests in `src/architecture.test.ts` first. Each test runs `render.mjs` with `process.execPath` in a child process. The fixture tests copy each `nodejs/wishem/*/package.json` to `<tmp>/packages/<folder>/package.json` and the SVG files and `README.md` of the architecture folder to `<tmp>/out/`, and run the script with `--packages` and `--out`. The tests: the real document passes `--check` with exit code 0 and `render: each file is current`; a new runtime dependency makes `--check` end with exit code 1 and name `packages-light.svg` and `packages-dark.svg`, and a run without `--check` writes a card with `Uses: clock, core, hub` for `renderer-pixi`; a peer dependency goes in the line `Uses:`; a development dependency goes in the line `Tests with:`; a package with no layer, a layer with a missing package, a package in two layers, a runtime dependency to a higher layer, a missing row of the table, a package that is not a development dependency of `docs-check`, and a folder name that differs from the `name` field each give the line of Decision 5 and exit code 1, and write no file; a development dependency to a higher layer passes. Run `pnpm --filter @thrashplay/wishem-docs-check test` under the lock and verify that each test fails for the right reason (the option is not known, or the view does not exist). Put the failing output in the report.
- [x] 1.3 In `render.mjs`, read the packages, apply the layers and the checks of Decisions 4 and 5, add the options `--check`, `--packages`, and `--out`, and describe the view of Decision 3. Keep one text function and the fit check. Verify that the tests of step 1.2 pass, and that a second run of `node nodejs/wishem/docs/architecture/render.mjs` changes no file.
- [x] 1.4 In `README.md`, add the section `## Package dependency view: Wishem` in the place of Decision 8, with the picture, the text about the layers and the check, and the table of the packages (package in backticks, layer, responsibility). Remove the dependency list below the table of the containers. Verify that `--check` passes and that removing a row makes it fail.
- [x] 1.5 Add the entry `@thrashplay/wishem-docs-check#test` to the root `turbo.json`, with the inputs of Decision 6. Verify: run `pnpm exec turbo run test --filter @thrashplay/wishem-docs-check` two times (the second run is a cache hit), change `nodejs/wishem/renderer-pixi/package.json`, and run it again (a cache miss). Restore the file.
- [x] 1.6 Add `docs-check` to the package list of `nodejs/wishem/CLAUDE.md`. Add the changeset (`@thrashplay/wishem-docs-check`: minor). Look at the images of `packages` in each theme, and run `check-svg.mjs` on the two files. Run lint and the type check of `@thrashplay/wishem-docs-check` under the lock. Verify steps 2 to 8 of "The test guide".

## Task 2: The container diagram of runtime units

Files: `nodejs/wishem/docs/architecture/render.mjs`, `nodejs/wishem/docs/architecture/README.md`, `containers-light.svg`, `containers-dark.svg`, `nodejs/wishem/docs-check/src/architecture.test.ts`
Interfaces: consumes `render.mjs --check` and the tests of Task 1.

- [x] 2.1 Add the test first: `containers-light.svg` holds no text `TypeScript package` and no text `[import]`. Run the tests of `docs-check` under the lock, and verify that this test fails on the current diagram. Put the failing output in the report.
- [x] 2.2 In `render.mjs`, give an element an optional line `Package: <name>` (or `Example: <name>`) below the type (design Decision 2). Describe the container diagram of "Container diagram after the change": the designer and the 9 runtime units and stores, with each runtime relationship and no import. Make it about 880 pixels wide. Check each arrow against the code (step 3 of the `diagrams` skill). Write the `desc` again.
- [x] 2.3 In `README.md`, write the `alt` text again, remove each paragraph that explains an import, keep the prose of each runtime path, and add the column "Packages" to the table of the containers (Decision 2). Change the introduction: a container is a unit that runs or a store of data, and the package dependency view shows the packages.
- [x] 2.4 Run `render.mjs` two times. Verify that the test of step 2.1 and the other tests of `docs-check` pass, and steps 9 and 11 (for `containers`) of "The test guide". Look at the images in each theme, and run `check-svg.mjs` on the two files.

## Task 3: The arrows of the package dependency view, and the merge check

Files: `nodejs/wishem/docs/architecture/render.mjs`, `nodejs/wishem/docs/architecture/README.md`, `packages-light.svg`, `packages-dark.svg`, `nodejs/wishem/docs-check/src/architecture.test.ts`, `.github/workflows/merge-checks.yaml` (one step, permission #696), a new empty changeset
Interfaces: consumes `render.mjs --check`, the layers, and the tests of Task 1. Produces the arrow groups `<g class="uses" data-from="<package>" data-to="<dependency>">` of design Decision 3, and the step of Decision 11.

- [x] 3.1 Write the tests first, in `src/architecture.test.ts`:
  - Each runtime dependency has an arrow: for `packages-light.svg` and `packages-dark.svg` of the real document, the set of the pairs `data-from`/`data-to` is equal to the set of the pairs (package, Wishem package in its `dependencies` or `peerDependencies`) of each `nodejs/wishem/*/package.json`. No pair is missing, and no pair is extra.
  - No test dependency has an arrow: for each Wishem package that is only in the `devDependencies` of a package, the SVG has no arrow for the pair, and the card of the package names it in the line `Tests with:`.
  - The view has no line `Uses:`.
  - Change the three tests of the cards that read the text `Uses:`: a new runtime dependency of `renderer-pixi` to `clock` gives the arrow `data-from="renderer-pixi" data-to="clock"`; a peer dependency of `renderer-pixi` to `update` gives an arrow; a development dependency of `renderer-pixi` to `clock` gives `Tests with: clock` and no arrow.
  - A cycle in one layer: in a fixture, `core` gets `@thrashplay/wishem-update` in `dependencies`. The script prints the line of the cycle (design Decision 5), ends with exit code 1, and writes no file.
  - Each check of the routes (design Decision 3) fails with its message, ends with a non-zero exit code, and writes no file. Use the helper `patchedScript` with a patch that breaks the router, for example a patch that gives two arrows the same track for "share a line", and a patch that moves a card into a lane for "crosses the card". Write one test for each message.
    Run the tests of `docs-check` under the lock, and verify that each new test fails for the right reason (no arrow exists, or the line `Uses:` exists). Put the failing output in the report.
- [x] 3.2 Run step 14.1 of "The test guide" and verify that it finds no line. Put the output in the report.
- [x] 3.3 In `render.mjs`, do design Decision 3: the rank of each package in its band, the rows, the grid of three columns, the order of the cards, the ports, the tracks, the lanes, and the routes. Add the check of a cycle (Decision 5) and the four checks of the routes. Draw each arrow as a group with `class="uses"`, `data-from`, `data-to`, and a `<title>`, with the quiet color and no chip, through the function `arrow` or one function next to it, so that `MIN_PLAIN` applies. Remove the line `Uses:` from the cards. Add a legend with the band, the card, and the arrow (`Uses at run time [dependencies, peerDependencies]`). Write the `desc` again. Verify that the tests of step 3.1 pass, and that a second run of `node nodejs/wishem/docs/architecture/render.mjs` changes no file.
- [x] 3.4 Look at the images of `packages` in each theme (step 11 of "The test guide"). Change the layout constants until each item of the checklist passes and each arrow is easy to follow. Run `check-svg.mjs` on the two files. Describe each image in the report: the rows, the arrows, and each place where arrows are close together.
- [x] 3.5 In `README.md`, write the `alt` text of the view again (Decision 3), and change the prose of the section: each arrow goes from a package to a package that it uses at run time, each arrow goes down, and the line `Tests with:` gives the test dependencies. Say that the merge checks of each pull request and the tests of `docs-check` run the check.
- [x] 3.6 In `.github/workflows/merge-checks.yaml`, add the step of design Decision 11 after the step `Setup dependencies`. Do not change any other line of the workflow. Add an empty changeset (`pnpm exec changeset --empty`) for the step.
- [x] 3.7 Run the tests, lint, and the type check of `@thrashplay/wishem-docs-check` under the lock. Verify steps 2, 3, 5, 13, and 14.1 of "The test guide", and that `node nodejs/wishem/docs/architecture/render.mjs --check` passes.

## Task 4: The component diagram of the workbench process

Files: `nodejs/wishem/docs/architecture/render.mjs`, `nodejs/wishem/docs/architecture/README.md`, new `components-workbench-process-light.svg` and `components-workbench-process-dark.svg`, `nodejs/wishem/docs-check/src/architecture.test.ts`
Interfaces: consumes `render.mjs --check` and the tests of Task 1.

- [x] 4.1 Add the test first: `components-workbench-process-light.svg` and `components-workbench-process-dark.svg` exist, and the light file holds the names of the nine components of design Decision 7. Run the tests of `docs-check` under the lock, and verify that this test fails because the file does not exist. Put the failing output in the report.
- [x] 4.2 Read `workbench-app/scripts/start.ts`, `host-nodejs/src/start-construct.ts`, `host-nodejs/src/model-folder-storage.ts`, `construct-manager/src/construct-manager.ts`, `construct-manager/src/product-construct.ts`, and `update/src/update.ts`. Record the direction of each relationship of Decision 7. Correct the arrows of the plan where the code differs, and say so in the report.
- [x] 4.3 In `render.mjs`, describe the diagram `components-workbench-process` with the title `Component diagram: the workbench process`, a boundary of the process, the page and the two model folders outside it, the amber path of Decision 7, and a legend. Run it two times.
- [x] 4.4 In `README.md`, add the section `## Component diagram: the workbench process` after the component diagram of the page, with the picture, the prose, and the table of the components (name, type, the module of each one). Verify that the tests of `docs-check` pass, and step 10 and step 11 (for `components-workbench-process`) of "The test guide". Look at the images in each theme, and run `check-svg.mjs` on the two files.

## Task 5: The instructions for diagrams

Files: `docs/diagrams.md`, `.claude/skills/diagrams/SKILL.md`, `CLAUDE.md` (section "Diagrams"), `openspec/config.yaml`, `nodejs/wishem/docs/autonomous-flow.md`, `nodejs/wishem/docs/README.md`, `nodejs/wishem/docs/architecture/render.mjs` (header comment only)
Interfaces: consumes the file names, the options, and the rules of Tasks 1 to 4.

- [x] 5.1 Run the three commands of step 12 of "The test guide" first, and put the output in the report. Verify that they fail: the first finds lines, and the other two find no line.
- [x] 5.2 Make each change of the table of design Decision 9. Use ASD-STE100, and describe the current state. The permission for the files outside `nodejs/wishem/` is #649.
- [x] 5.3 Run `pnpm exec prettier --write` on each changed file. Verify step 12 of "The test guide", and that `node nodejs/wishem/docs/architecture/render.mjs --check` passes.

## Workflow follow-up

- Do the order steps of design "Order with other changes" when #542 or #537 merges before this change.
- Run `pnpm exec openspec validate 650-diagram-views --strict`, archive the change, and finish with `superpowers:finishing-a-development-branch`.
