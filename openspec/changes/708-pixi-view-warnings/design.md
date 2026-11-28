# Design

## Context

See proposal.md, "Why". The facts that shape the approach:

- `propNames` in `nodejs/wishem/renderer-pixi/src/field-names.ts` already reports the problem `same-name` (with the name and the two field IDs) and keeps only the first field in `props`. Its tests already cover this (`reports two labels with one name, and keeps the first field only`). `field-names.ts` does not change.
- `viewWarnings` in `nodejs/wishem/renderer-pixi/src/view-warnings.ts` converts only the problem `empty-name`. It skips a view whose component type has no definition. `ViewWarning` has only the kind `empty-name`. The result is sorted by sidecar and component type.
- `startRenderer` in `src/renderer.ts` calls `warn(part?.definitions ?? [])` after each new part `store`. A joined state with no part `store` thus gives an empty list of definitions.
- `viewWarnings` of `renderer-react` (`nodejs/wishem/renderer-react/src/view-warnings.ts`) gives the kinds `component-type-not-defined`, `same-name`, `reserved-name`, and `empty-name`, and `holdWarnings` gives `reference-cycle`. `compareWarnings` sorts by sidecar, component type, name (`''` when the warning has no name), and kind. `Renderer` gives no warning when the part `store` is absent (`model ? [...] : []`). `describeWarning` gives these two lines, which this change copies:

  ```text
  wishem: the sidecar <sidecar> names the component type <component type ID>, which no definition has. No view is drawn for it.
  wishem: the sidecar <sidecar>: the fields <first field ID> and <second field ID> of the component type <component type ID> give the same name "<name>". The prop has the value of the first field.
  ```

- The PixiJS renderer has no reserved names and no prop that holds a picture (the archived change 663, "Non-Goals").
- The architecture document says that `renderer-pixi` imports only types from `core` and `hub`, so the container diagram shows no relationship from it.

## Goals / Non-Goals

**Goals:**

- The PixiJS renderer gives the warnings `component-type-not-defined` and `same-name` with the lines, the order, and the rule for an absent part `store` of the React renderer.
- A decision on a shared module for the rule of the names (issue #708).

**Non-Goals:**

- The warnings `reserved-name` and `reference-cycle` in the PixiJS renderer.
- A change to `renderer-react`, `pixi-page`, `renderer-godot`, or the exports of `renderer-pixi`.
- An option `onWarning`. Decision 2 of the change 663 rejected it.

## Decisions

### 1. No shared module: each renderer keeps its copy of the rule of the names and of the lines

`renderer-pixi` keeps `src/field-names.ts` and `src/view-warnings.ts`. This change copies the two lines and the order of `renderer-react` into them. The two specifications are the source of the rule: `wishem/renderer-pixi/renderer` refers to `wishem/renderer-html/view-types` for the names, and requires "the same text as the warning of the React renderer". The tests of each package check each line as an exact string.

Reasons:

- The two copies are not the same rule. `renderer-react` has the reserved names `wishem` and `key`, the warning `reserved-name`, and the warning `reference-cycle`. A shared `propNames` needs an option for the reserved names, and a shared `viewWarnings` needs a set of kinds for each renderer. The shared module is then more code than the two copies.
- The third renderer, the Godot renderer, runs GDScript. It cannot import a TypeScript module. A shared module does not give one source of the rule for all renderers. The specification does.
- A shared module adds a package or an import between packages. The architecture document and its diagrams then change, and change #650 (PR #687) rewrites that document and adds a check of the imports (`docs-check`). This change touches neither.
- The decision is easy to change later. Each module is internal to a private package, and no page imports it.

Alternatives:

- A new private package (for example `view-names`) that both renderers import. Rejected: a new package and two new relationships in the architecture document, for less code than the package costs. Reconsider it when a third renderer in TypeScript needs the rule, or when the rule of the names changes.
- A subpath export of `core`. Rejected: `core` holds the model. The lines name sidecars and views, which `core` does not know. `renderer-pixi` would also import a value from `core`, which adds a relationship to the container diagram.
- `renderer-pixi` imports `fieldName`, `propNames`, and `describeWarning` from `renderer-react`. Rejected: the root entry of `renderer-react` is React code, and `react` is its peer dependency. A PixiJS page would then need React.
- A test in `renderer-pixi` that compares its lines with those of `renderer-react`. Rejected: it needs `renderer-react` as a development dependency, which `docs-check` of #650 compares with the architecture document. The exact lines in the tests of each package already find a change to one copy.

### 2. A sidecar whose component type has no definition gives one warning, and no warning for an absent part `store`

`viewWarnings` gives `{ kind: 'component-type-not-defined', sidecar, componentType }` for each view whose component type is not in the definitions, and continues with the next view. `startRenderer` computes the lines only when the part `store` exists. With no part `store`, the list of lines is empty, so the renderer writes nothing and keeps `''` as the last text. Reason: the rule of `Renderer` of `renderer-react`. With the current call `warn(part?.definitions ?? [])`, each view would give a warning while the joined state has no part `store`.

The renderer still draws nothing for such a view. No code of the drawing changes: the loop of `sync` reads only the definitions.

Alternative: a warning also for an absent part `store`. Rejected: the React renderer gives none, and a page that starts before its first state would write a false warning for each view.

### 3. Two labels that give the same name give one warning for each later field

`viewWarnings` converts each `same-name` problem of `propNames` to `{ kind: 'same-name', sidecar, componentType, name, fields: [first, later] }`. Three fields with one name give two warnings, each with the first field. This is the result of `propNames` in the two renderers.

### 4. The order of `renderer-react`

`viewWarnings` sorts with the comparison of `renderer-react`: sidecar, component type, name (`''` when the warning has no name), and kind. The sort is stable, so the warnings `empty-name` of one component type keep the order of the fields, as now. Reason: the issue asks for the same lines, and the renderer writes the lines in this order. A warning `empty-name` comes before a warning `same-name` of the same component type, because its name is `''`.

### 5. `ViewWarning` has the shape of `renderer-react`

`fields` and `name` become optional members, as in `renderer-react`. `describeWarning` has one case for each kind, with the text of `renderer-react`. Reason: the same shape makes the copies easy to compare in a review. The module stays internal, and `src/index.ts` does not change.

Alternative: a discriminated union with one type for each kind. Rejected: a better type, but a second shape for the same data in the two renderers.

### 6. Two tasks, one for each warning

Task 1 adds `component-type-not-defined` and the rule for an absent part `store`. Task 2 adds `same-name` and the full order of decision 4. A reviewer can approve one warning and reject the other. Each task has its own changeset, its own tests that fail first, and the automated tests of its steps of "The test guide".

### 7. No question for the owner

The decisions do not meet the three conditions of "When to ask the owner" in `nodejs/wishem/docs/autonomous-flow.md`. They copy the rule of the React renderer, and they are easy to change later: one internal module of a private package.

## Interfaces

Package `@thrashplay/wishem-renderer-pixi`. The exports do not change. Internal module `src/view-warnings.ts` after Task 2:

```ts
import type { ComponentTypeDefinition, Id } from '@thrashplay/wishem-core'
import type { ViewTable } from './types.js'

export interface ViewWarning {
  kind: 'component-type-not-defined' | 'same-name' | 'empty-name'
  sidecar: string
  componentType: Id
  /** Set for `same-name`. One field for `empty-name`. */
  fields?: [Id, Id] | [Id]
  /** Set for `same-name`. */
  name?: string
}

/** The result is sorted by sidecar, component type, name, and kind. */
export const viewWarnings: (views: ViewTable, definitions: readonly ComponentTypeDefinition[]) => ViewWarning[]

/** One line for the browser console. */
export const describeWarning: (warning: ViewWarning) => string
```

After Task 1, `kind` is `'component-type-not-defined' | 'empty-name'`, `fields` is optional, and `name` does not exist yet.

## Package Impact

| Package                            | Published or private | Bump  | Why                                                                                 |
| ---------------------------------- | -------------------- | ----- | ----------------------------------------------------------------------------------- |
| `@thrashplay/wishem-renderer-pixi` | private              | patch | The renderer warns about a sidecar whose component type has no definition (Task 1). |
| `@thrashplay/wishem-renderer-pixi` | private              | patch | The renderer warns about two labels that give the same name (Task 2).               |

Two changesets, one for each warning: `.changeset/708-renderer-pixi-type-not-defined.md` and `.changeset/708-renderer-pixi-same-name.md`. No other package changes. `@thrashplay/wishem-pixi-page` uses the renderer, but its sidecar names a defined component type and its definition has one field, so its behavior does not change.

## Risks / Trade-offs

- [The two copies of the rule and of the lines drift apart] → The specification requires the same text, and the tests of each package check the exact lines. Decision 1 gives the condition to reconsider a shared module.
- [A test of `renderer.test.ts` with a view whose type has no definition writes a warning to the test output] → Each test that can make a warning spies on `console.warn`. Task 1 finds such tests with a run of the tests.
- [A product that has a view for a type that it removed gets a new warning in the console] → This is the purpose of the warning. The renderer continues to draw.

## Migration Plan

None. The package is private.

## Order with other changes

- **#542 (three renderers end to end, PR #674, in the final review).** It changes `pixi-page` (it removes `src/construct/model.ts` and changes `src/views/ClearColor.view.json`), `renderer-godot`, `sample-product`, `construct-manager`, and the architecture document. It does not change `renderer-pixi` or the specification `wishem/renderer-pixi/renderer`. The code of the two changes does not overlap. Either order works.
  - When this change merges first: #542 needs no extra step.
  - When #542 merges before the final review of this change: the lead agent changes steps 2 and 5 of "The test guide" with `openspec-update-change`. The start is the two commands of #542 (`pnpm --filter @thrashplay/wishem-three-renderers construct`, then `pnpm --filter @thrashplay/wishem-pixi-page start`), and the hand edit of step 5 adds the field to the definition of the `Color` component type of the sample construct. Step 3 needs no change, because its `sed` command replaces each component type ID.
- **#539 (run controls, in apply).** It changes `clock`, `construct-manager`, `workbench-app`, `sample-product`, and the glossary and concepts. No overlap.
- **#632 (the source of a model warning, finishing).** It changes `core`, `host-nodejs`, and `workbench-app`. No overlap.
- **#650 (architecture diagrams, PR #687).** It rewrites `docs/architecture/README.md` and `render.mjs`, and adds `docs-check`. This change does not touch them and adds no package and no import. No order step.
- **Open `Bug` issues of `app:wishem`.** #712 (the end-to-end test of the three renderers failed one time at the start of the PixiJS page) is about the start of the page server of #542, not the warnings. This change does not touch it. #692 (a UI test of the view warnings of `workbench-app`) is about the React warnings in `workbench-app`. This change does not touch it. #706, #685, and #671 touch other packages. No open `Bug` issue touches `renderer-pixi`.

## The architecture document

No package, process, relationship, or import changes. `renderer-pixi` still imports only types from `core` and `hub`. `nodejs/wishem/docs/architecture/README.md` and `render.mjs` do not change. The README of `renderer-pixi` gets the two warnings (Task 1 and Task 2).

## The test guide

The final reviewer does these steps on the branch with real processes, real files, and a real web browser, and reports the real result of each step. Run each command from the root of the worktree. Terminal 1 runs the page. Terminal 2 runs commands. The startup lines of step 2 are the lines of `main` (the README of `pixi-page`). Each `wishem:` warning line is the result after the change. On `main`, the page writes no `wishem:` warning in steps 3 to 5.

### 0. Prepare

```sh
pnpm install
node nodejs/wishem/docs/flow-scripts/heavy.mjs pnpm build --filter "@thrashplay/wishem-pixi-page..."
```

Result: the build ends with each task successful.

### 1. The tests of the package

```sh
node nodejs/wishem/docs/flow-scripts/heavy.mjs pnpm --filter @thrashplay/wishem-renderer-pixi exec vitest run src/view-warnings.test.ts src/renderer.test.ts
```

Result: each test passes. The output has the tests `gives one warning for a view whose component type has no definition` and `gives one warning for two labels that give the same name` (`view-warnings.test.ts`), and the tests of the describe blocks `startRenderer: warnings through a link` (`renderer.test.ts`).

### 2. The page with no warning

Terminal 1:

```sh
pnpm --filter @thrashplay/wishem-pixi-page start
```

Result: `wishem: link at ws://127.0.0.1:4748/link` and `wishem: PixiJS page at http://127.0.0.1:5174/`. Open `http://127.0.0.1:5174/` and the developer tools. Result: the canvas changes color two times each second, in the cycle blue, red, green, amber. The status line is `Connected (link 1). Space: pause or run. Period: one step.` The console has no line that starts with `wishem:`.

Press Ctrl+C in terminal 1.

### 3. A hand edit of the sidecar names a component type that is not defined

Terminal 2:

```sh
sed -i 's/"componentType": "[^"]*"/"componentType": "ct_00000000-0000-4000-8000-000000000001"/' nodejs/wishem/pixi-page/src/views/ClearColor.view.json
git diff --stat
```

Result: `git diff --stat` shows one file, `nodejs/wishem/pixi-page/src/views/ClearColor.view.json`, with one line changed.

Terminal 1: run the command of step 2 again. Reload the page.

Result:

- The console has exactly one line that starts with `wishem:`: `wishem: the sidecar ClearColor.view.json names the component type ct_00000000-0000-4000-8000-000000000001, which no definition has. No view is drawn for it.`
- The canvas has the black background of PixiJS and does not change color. The status line is `Connected (link 1). Space: pause or run. Period: one step.`

### 4. Inputs do not repeat the warning

Click the page. Press Space. Then press Period two times.

Result: the console gets no new line that starts with `wishem:`.

### 5. A hand edit gives two labels with the same name

Press Ctrl+C in terminal 1. Terminal 2:

```sh
git checkout nodejs/wishem/pixi-page/src/views/ClearColor.view.json
sed -i "s/fields: \[{ id: COLOR_FIELD, label: 'Color', type: 'string' }\]/fields: [{ id: COLOR_FIELD, label: 'Color', type: 'string' }, { id: 'fld_5d6e7f80-9a1b-4c2d-8e3f-4a5b6c7d8e9f', label: 'color', type: 'string' }]/" nodejs/wishem/pixi-page/src/construct/model.ts
git diff --stat
```

Result: `git diff --stat` shows one file, `nodejs/wishem/pixi-page/src/construct/model.ts`, with one line changed.

Terminal 1: run the command of step 2 again. Reload the page.

Result:

- The console has exactly one line that starts with `wishem:`: `wishem: the sidecar ClearColor.view.json: the fields fld_590c5266-eb3d-4022-bb6c-7856b920c4e1 and fld_5d6e7f80-9a1b-4c2d-8e3f-4a5b6c7d8e9f of the component type ct_768a9edd-1db9-4a37-9190-9ea4af8aeebe give the same name "color". The prop has the value of the first field.`
- The canvas changes color two times each second, in the cycle of step 2. Press Space, then Period two times: the color stops, and then changes one time at each Period. The console gets no new line that starts with `wishem:`.

### 6. Remove the hand edit

Press Ctrl+C in terminal 1. Terminal 2:

```sh
git checkout nodejs/wishem/pixi-page/src/construct/model.ts
git status --short
```

Result: `git status --short` prints nothing.

### The automated tests of the steps

A program can do steps 2 to 5 without a web browser: a hub with the store serves a link, the renderer reads its remote port, and the table of views comes from `collectViews` with the modules of a sidecar file and of a view file. These tests are in `renderer-pixi`, in the describe block `startRenderer: warnings through a link` of `src/renderer.test.ts`:

- Steps 3 and 4: Task 1, step 1.1.
- Step 5: Task 2, step 2.1.
- Step 2 (no warning for a model with no problem) is the current test `does not warn for a model with no field with an empty name`.

A Playwright test of `pixi-page` is not added. It would need a hand edit of the files of `pixi-page`, which #542 changes, and the page adds no code to the path of the warnings.

## Follow-up

None. Decision 1 records the condition to reconsider a shared module.
