# Tasks

Each task writes its tests first and shows a failing run before the code. Run lint, the type check, and the tests only for the packages of the task, from the root of the worktree, in this form: `node nodejs/wishem/docs/flow-scripts/heavy.mjs <command>`. Tasks 2, 3, and 4 need Task 1. Task 5 needs Tasks 2, 3, and 4.

## Task 1: The table of color cases of the sample product

Files: `nodejs/wishem/sample-product/src/color-cases.ts` (new), `src/color-cases.test.ts` (new), `README.md`, `src/readme-example.test.ts` (only if the README gets a code example); `nodejs/wishem/docs/architecture/README.md` (the table row of `sample-product`)
Interfaces: produces `COLOR_CASES`, `ColorCase`, and `FALLBACK_COLOR` (`'#ff00ff'`) of `@thrashplay/wishem-sample-product/color-cases`, as "Interfaces" of `design.md` gives them. Consumes `COLORS` of `src/color-behavior.ts` and the type `FieldValue` of `core`.

- [x] 1.1 Write `src/color-cases.test.ts`: each color of `COLORS` is a case whose color is the same; `FALLBACK_COLOR` is `#ff00ff` and is not in `COLORS`; each `color` matches `^#[0-9a-f]{6}$`; the names are unique; the table holds a case with no `value` key and the values `#1D4ED8`, `red`, `rgb(29, 78, 216)`, `transparent`, `#fff`, `#1d4ed880`, and `1d4ed8`; and the color of each case is the value in lower case when the value matches `^#[0-9a-fA-F]{6}$`, and `FALLBACK_COLOR` for each other case. Verify that it fails.
- [x] 1.2 Write `src/color-cases.ts` with the table of decision 6 of `design.md`. Do not export it from `src/index.ts`. Verify that the tests of 1.1 and each other test of `sample-product` pass, that the build of `sample-product` gives `dist/color-cases.js`, and that the build still uses no Node.js API.
- [x] 1.3 Add the section "The color cases" to the README of `sample-product`: the rule (`#rrggbb`), the fallback color, the subpath `@thrashplay/wishem-sample-product/color-cases`, and that the tests of the three `ClearColor` views check the table. Add "the table of color cases (`color-cases`)" to the row of `sample-product` in `docs/architecture/README.md`. If the README gets a code example, add it to `src/readme-example.test.ts` and verify that it passes.

## Task 2: The React page draws the fallback color

Files: `nodejs/wishem/three-renderers/src/views/ClearColor.tsx`, `src/views/ClearColor.test.tsx`, `README.md`
Interfaces: consumes `COLOR_CASES` and `FALLBACK_COLOR` of `@thrashplay/wishem-sample-product/color-cases` (in the test only).

- [x] 2.1 Change `src/views/ClearColor.test.tsx`: for each case of `COLOR_CASES`, the markup has one `div` with `position: absolute` and `inset: 0`, and its `backgroundColor` is the RGB form of the color of the case (for example `rgb(255, 0, 255)` for `#ff00ff`). Replace the test "draws nothing when the prop has no value". Keep the test of the sidecar. Verify that the cases of no value, `1d4ed8`, `red`, and `#1d4ed880` fail.
- [x] 2.2 Change `src/views/ClearColor.tsx` as decision 4 of `design.md` gives it: the prop `color` is `FieldValue | undefined`, the fill is the value when it matches `/^#[0-9a-f]{6}$/i`, and `#ff00ff` for each other value. The view always draws the `div`. Verify that each test, the lint, and the type check of `three-renderers` pass.
- [x] 2.3 In "The React page" of the README, give the rule and the fallback color.

## Task 3: The PixiJS page draws the fallback color

Files: `nodejs/wishem/pixi-page/src/views/ClearColor.ts`, `src/views/ClearColor.test.ts`, `README.md`
Interfaces: consumes `COLOR_CASES` and `FALLBACK_COLOR` of `@thrashplay/wishem-sample-product/color-cases` (in the test only; `sample-product` is already a development dependency of `pixi-page`).

- [x] 3.1 Change `src/views/ClearColor.test.ts`: for each case of `COLOR_CASES`, after `update`, the sprite is visible, covers the viewport at (0, 0), and has the tint `Number.parseInt(color.slice(1), 16)` of the color of the case. A case after a different case gives the same result (the sprite does not keep the old tint). Replace the three tests that expect a hidden sprite. Keep the tests of `create`, of a smaller viewport, and of the sidecar. Verify that the cases of no value, `red`, `rgb(29, 78, 216)`, `1d4ed8`, and `blue-ish` fail.
- [x] 3.2 Change `src/views/ClearColor.ts` as decision 4 of `design.md` gives it: no use of `Color` of PixiJS, the same expression as the React view, the fallback `#ff00ff`, and `sprite.visible = true` at each update. Verify that each test, the lint, and the type check of `pixi-page` pass, and that `pnpm --filter @thrashplay/wishem-pixi-page test:ui` passes with the baselines as they are.
- [x] 3.3 In "What the page shows" of the README, give the rule and the fallback color.

## Task 4: The Godot application draws the fallback color

Files: `nodejs/wishem/renderer-godot/godot/views/ClearColor.gd`, `godot/tests/test_clear_color.gd`, `godot/tests/fixtures/color-cases.json` (new), `src/color-cases.test.ts` (new), `README.md`
Interfaces: consumes `COLOR_CASES` of `@thrashplay/wishem-sample-product/color-cases` (in `src/color-cases.test.ts` only; `sample-product` is already a development dependency of `renderer-godot`).

- [x] 4.1 Write `src/color-cases.test.ts` as `src/link-examples.test.ts` does: the parsed `godot/tests/fixtures/color-cases.json` is equal to `COLOR_CASES`. Verify that it fails, then write the fixture (the "no value" case has no `value` key) and verify that it passes.
- [x] 4.2 Change `godot/tests/test_clear_color.gd`: one test reads the fixture, and for each case it updates a new node with `{"color": value}` (or `{}` for no value) and checks that the node is visible, at `Vector2.ZERO`, with the size of the viewport, and with `Color.html(<color of the case>)` and an alpha of 1. A failed check names the case. Replace the two tests that expect a hidden node. Keep the other tests. Run `pnpm --filter @thrashplay/wishem-renderer-godot test:godot`, and verify that the new test fails.
- [x] 4.3 Change `godot/views/ClearColor.gd` as decision 4 of `design.md` gives it: a `RegEx` with `^#[0-9a-fA-F]{6}$`, `Color.html` only for a value that matches, `Color.html("#ff00ff")` for each other value, and `rect.visible = true` at each update. Change the doc comment of the file. Verify that `test:godot` ends with `0 failed`, and that `pnpm --filter @thrashplay/wishem-renderer-godot test:ui` passes. Verify that the lint, the type check, and the unit tests of `renderer-godot` pass.
- [x] 4.4 In "The view ClearColor" of the README, give the rule and the fallback color, and the fixture with its test.

## Task 5: The three pictures agree in the test from end to end

Files: `nodejs/wishem/three-renderers/tests/three-renderers.guide.ui.test.ts`, `README.md`
Interfaces: consumes `storeInputs` of `core`, `COLOR_FIELD`, `COLOR_TYPE`, and `SAMPLE_ENTITY` of `sample-product`, `FALLBACK_COLOR` of `sample-product/color-cases`, and `waitForColor` of `tests/guide-helpers.ts`.

- [x] 5.1 Add steps 14 to 17 of decision 7 of `design.md` after step 13, before the `finally` block. Each input goes through the input port of the test, and each step checks the three pictures with the helper `colors` of the test and `POLL_MS`. Build the two models of steps 16 and 17 from `port.read().store`. To see it fail, put the three view files of `main` in the worktree (`git checkout origin/main -- <the three ClearColor files of Tasks 2, 3, and 4>`), run `pnpm --filter @thrashplay/wishem-three-renderers test:ui`, and record that step 14 fails. Restore them with `git checkout HEAD -- <the same files>`. Then run the test again and verify that it passes, and that `docker ps -a` shows no container of the run after it ends.
- [x] 5.2 Prove that the test can fail, and record each result in the report: (a) make the PixiJS view hide its sprite for a value that is not a color, and verify that step 14 fails at the check of the PixiJS page; (b) make the Godot view draw `#000000` as the fallback, and verify that step 14 fails at the check of Godot; (c) make the React view draw nothing for no value, and verify that step 16 fails at the check of the React page. Restore the code after each check, and verify that the test passes again.
- [x] 5.3 In "The test from end to end" of the README, add the steps for a value that is not a color, for no value, and for a label that gives an empty name. Do the steps of "The test guide" of `design.md`, and record the real result of each step in the report.

## Workflow follow-up

- Add two changesets, as "Package Impact" of `design.md` gives them: one `minor` for `sample-product`, and one `patch` for `three-renderers`, `pixi-page`, and `renderer-godot`.
- Before the archive, merge `main`, and read the main specs `wishem/renderer-pixi/page`, `wishem/renderer-html/react-page`, `wishem/renderer-godot/renderer`, `wishem/renderers/sample-construct`, and `wishem/renderers/end-to-end-test` again (#744 changes `wishem/renderer-pixi/page`). Each MODIFIED requirement copies the current text of `main`.
- When the pull request merges, create the follow-up issue of `design.md`, and create the break-test issue of `sample-product` (a library package), with `src/color-cases.ts` and its test.
