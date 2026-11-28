# Design

## Context

See proposal.md, "Why". The facts that shape the approach:

- `propNames` in `nodejs/wishem/renderer-pixi/src/field-names.ts` gives the props of a definition and a list of problems. It reports `empty-name` for a label with no ASCII letter or digit, but it keeps the first such field in `props` with the name `""`. `propsOf` in `src/renderer.ts` gives each entry of `props` to the view. Nothing reads `problems`.
- The PixiJS renderer gives no warning of any kind. It gives each error of a view to `onError` (default `console.error`).
- `propNames` of `renderer-react` skips a field with an empty name after the problem `empty-name`. `viewWarnings` converts the problem to a `ViewWarning` with the kind `empty-name`, and `describeWarning` gives this line:

  ```text
  wishem: the sidecar <sidecar>: the label of the field <field ID> of the component type <component type ID> gives an empty name. The view does not get the field.
  ```

  `Renderer` computes the lines for each view of the table of views when the part `store` changes, and writes each line with `console.warn` only when the joined text differs from the last text.

- The PixiJS renderer has no reserved names. Its views get no prop `wishem` and no prop `key`.
- The views of `pixi-page` (`ClearColor`) read the prop `color` only. Their definitions have no field with an empty name.

## Goals / Non-Goals

**Goals:**

- The PixiJS renderer and the React renderer agree for a field whose label gives an empty name: no prop, and one warning in the browser console with the same text.

**Non-Goals:**

- Other warnings of the PixiJS renderer: the same name, a component type with no definition. See "Follow-up".
- Reserved names in the PixiJS renderer. Its views have no prop that a field can hide.
- A change to a label that gives a name that starts with a digit. Decision 5 of the change 657 keeps its prop in the React renderer. The PixiJS renderer does the same.
- A change to `fieldName`, to `pixi-page`, or to the Godot renderer.

## Decisions

### 1. A field with an empty name gives no prop

`propNames` skips the field after it reports `empty-name`, as `propNames` of `renderer-react` does. Two fields with an empty name give two `empty-name` problems and no `same-name` problem. Reason: the rule of #657, and one rule in the two renderers.

Alternative: keep the prop `""`. Rejected: the issue asks for the rule of #657.

### 2. The renderer writes the warning with `console.warn`

`startRenderer` writes each warning with `console.warn`, as `Renderer` of `renderer-react` does. `RendererOptions` does not change.

Alternative: an option `onWarning` with the default `console.warn`, as `onError`. Rejected: the React renderer has no such option, and no page needs one. An option can be added later with no breaking change.

### 3. The warnings come from the table of views and the definitions of the part `store`

After each new part `store`, `startRenderer` computes the warnings for each view of the table of views whose component type has a definition, from that definition. A view gets its warning also when no entity has a component of its type. The renderer keeps the joined text of the last lines, and writes the lines again only when the text differs. The first part `store` with no problem writes nothing. A part with no `store` gives no lines. Reason: this is the rule of `Renderer` of `renderer-react`.

After `stop`, the renderer writes nothing. A new renderer (for example after a new link of `pixi-page`) writes its warnings one time again.

### 4. An internal module `view-warnings.ts`, with the same names as in `renderer-react`

`src/view-warnings.ts` holds `ViewWarning`, `viewWarnings`, and `describeWarning`, with the same names and the same line as in `renderer-react`. `ViewWarning` has only the kind `empty-name`. The order of the warnings is the order of `renderer-react`: by sidecar, then by component type, and then the order of the fields in the definition.

`src/index.ts` does not export them. Reason: no page needs them, and the exports of the package do not change. The two renderers do not share the code: they share no package other than `core` and `hub`, and a shared module is a larger change than the issue (see "Follow-up").

### 5. No question for the owner

The decisions do not meet the conditions of "When to ask the owner" in `nodejs/wishem/docs/autonomous-flow.md`. They copy a rule that the change 657 already set, and they are easy to change later: one function and one internal module in a private package.

## Interfaces

Package `@thrashplay/wishem-renderer-pixi`. The exports do not change. Internal module `src/view-warnings.ts`:

```ts
import type { ComponentTypeDefinition, Id } from '@thrashplay/wishem-core'
import type { ViewTable } from './types.js'

export interface ViewWarning {
  kind: 'empty-name'
  sidecar: string
  componentType: Id
  fields: [Id]
}

/** Sorted by sidecar and component type, then in the order of the fields. */
export const viewWarnings: (views: ViewTable, definitions: readonly ComponentTypeDefinition[]) => ViewWarning[]

/** One line for the browser console. */
export const describeWarning: (warning: ViewWarning) => string
```

`propNames(definition).props` of `src/field-names.ts` has no entry with the name `""`. `propNames(definition).problems` does not change.

## Package Impact

| Package                            | Published or private | Bump  | Why                                                                                       |
| ---------------------------------- | -------------------- | ----- | ----------------------------------------------------------------------------------------- |
| `@thrashplay/wishem-renderer-pixi` | private              | patch | A field with an empty name gives no prop. The renderer writes a warning for such a field. |

Two changesets, one for each change: the prop, and the warning. No other package changes. `@thrashplay/wishem-pixi-page` uses the renderer, but its views have no field with an empty name, so its behavior does not change.

## Risks / Trade-offs

- [A PixiJS view that reads the prop `""` gets no value] → No view of the repository reads it.
- [The line of the warning has two copies, one in each renderer] → The tests of each renderer check the exact line. "Follow-up" records the shared module.
- [`console.warn` in a test of the renderer writes to the test output] → Each test that makes a warning spies on `console.warn`.

## Migration Plan

None. The package is private.

## Order with other changes

- **#542 (three renderers end to end, draft PR #674).** No conflict in the code: #542 does not change `renderer-pixi/src/` or the specification `wishem/renderer-pixi/renderer`, and this change does not change `pixi-page`. Decision 12 of #542 already says that the PixiJS renderer gets the rule of #657 in #663. Either order works.
  - When this change merges first: #542 needs no extra step.
  - When #542 merges first: `pixi-page` holds no construct, and `src/construct/model.ts` is gone. Before the apply, the lead agent changes steps 2 to 5 of "The test guide" with `openspec-update-change`: the hand edit adds the field to the definition of the `Color` component type of the sample construct of #542, and the start command is the command of #542.
- **#657 (archived).** This change copies its rule. No file of `renderer-react` changes.
- **Open `Bug` issues.** #692 (a UI test of the view warnings of `workbench-app`) touches the React warnings in `workbench-app`. This change does not touch it. No other open `Bug` issue of `app:wishem` touches `renderer-pixi`.

## The architecture document

No package, process, relationship, or import changes. `nodejs/wishem/docs/architecture/README.md` does not change. The README of `renderer-pixi` gets the rule and the warning (Task 1).

## The test guide

The final reviewer does these steps on the branch with real processes, real files, and a real web browser, and reports the real result of each step. Run each command from the root of the worktree. Terminal 1 runs the page. Terminal 2 runs commands. The startup lines of step 2 are the lines of `main` (the README of `pixi-page`). Each warning line is the result after the change. On `main`, the page writes no `wishem:` warning in steps 3 and 4.

### 0. Prepare

```sh
pnpm install
node nodejs/wishem/docs/flow-scripts/heavy.mjs pnpm build --filter "@thrashplay/wishem-pixi-page..."
```

Result: the build ends with each task successful.

### 1. The tests of the package

```sh
node nodejs/wishem/docs/flow-scripts/heavy.mjs pnpm --filter @thrashplay/wishem-renderer-pixi exec vitest run src/field-names.test.ts src/view-warnings.test.ts src/renderer.test.ts
```

Result: each test passes. The output has these tests: `gives no prop for an empty name, and reports it` (`field-names.test.ts`), `gives one warning with the field ID for a label that gives an empty name` (`view-warnings.test.ts`), and `gives the view no prop for a field with an empty name, and warns one time` (`renderer.test.ts`).

### 2. The page with no field with an empty name

Terminal 1:

```sh
pnpm --filter @thrashplay/wishem-pixi-page start
```

Result: `wishem: link at ws://127.0.0.1:4748/link` and `wishem: PixiJS page at http://127.0.0.1:5174/`. Open `http://127.0.0.1:5174/` and the developer tools. Result: the canvas changes color two times each second, in the cycle blue, red, green, amber. The first color depends on the time that the server runs. The status line is `Connected (link 1). Space: pause or run. Period: one step.` The console has no line that starts with `wishem:`.

Press Ctrl+C in terminal 1.

### 3. A hand edit adds a field with an empty name

Terminal 2:

```sh
sed -i "s/fields: \[{ id: COLOR_FIELD, label: 'Color', type: 'string' }\]/fields: [{ id: COLOR_FIELD, label: 'Color', type: 'string' }, { id: 'fld_5d6e7f80-9a1b-4c2d-8e3f-4a5b6c7d8e9f', label: '???', type: 'string' }]/" nodejs/wishem/pixi-page/src/construct/model.ts
git diff --stat
```

Result: `git diff --stat` shows one file, `nodejs/wishem/pixi-page/src/construct/model.ts`, with one line changed.

Terminal 1: run the command of step 2 again. Reload the page.

Result:

- The console has exactly one line that starts with `wishem:`: `wishem: the sidecar ClearColor.view.json: the label of the field fld_5d6e7f80-9a1b-4c2d-8e3f-4a5b6c7d8e9f of the component type ct_768a9edd-1db9-4a37-9190-9ea4af8aeebe gives an empty name. The view does not get the field.`
- The canvas changes color two times each second, in the same cycle as in step 2.

### 4. Inputs do not repeat the warning

Click the page. Press Space. Then press Period two times.

Result: the color stops at Space, and changes one time at each Period. The console gets no new line that starts with `wishem:`.

### 5. Remove the hand edit

Press Ctrl+C in terminal 1. Terminal 2:

```sh
git checkout nodejs/wishem/pixi-page/src/construct/model.ts
git status --short
```

Result: `git status --short` prints nothing.

## Follow-up

- The PixiJS renderer gives no warning for two labels that give the same name or for a sidecar of a component type with no definition. The React renderer gives both. The lead agent creates one `Task` issue for this parity in `[WSH] A5 Renderers`, or adds it to the parity issue that #542 creates for the Godot warnings.
- The two renderers have two copies of `fieldName`, `propNames`, and the line of the warning. A shared module for the rule of the names is a different change. The lead agent records it in the same issue.
