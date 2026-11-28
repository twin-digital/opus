# Design

## Context

See proposal.md, "Why". `propNames` in `nodejs/wishem/renderer-react/src/field-names.ts` gives the props of a definition and a list of problems. It reports `empty-name` for a label with no ASCII letter or digit, but it keeps the first such field in `props` with the name `""`. Each user of `props` then uses that name:

- `Renderer.tsx` gives the view the prop `""`.
- `createViewTools` in `view-tools.ts` accepts `setField('', value)` and sends a `store/set-field` input.
- `findHolds` in `hold.ts` follows a reference field with the name `""`.

`viewWarnings` in `view-warnings.ts` converts only `same-name` and `reserved-name` to warnings, so the page gives no warning. The generator in `view-types.ts` converts each problem to an error and writes no file. The generator already obeys the specification `wishem/renderer-html/view-types`.

A field whose label gives a reserved name (`wishem` or `key`) has the rule that this change copies: `propNames` reports the problem and gives no prop, `viewWarnings` gives a warning, and the generator gives an error (the archived change `2026-11-28-535-add-view-inputs`).

The Godot renderer (`nodejs/wishem/renderer-godot/godot/wishem/views.gd`, `props`) skips a field with an empty name, and gives no message. The PixiJS renderer (`nodejs/wishem/renderer-pixi/src/field-names.ts`) has a copy of the old `propNames`, and gives the prop `""`.

## Goals / Non-Goals

**Goals:**

- The React renderer, the generator, and the specifications agree: a field whose label gives an empty name gives no prop, the page gives a warning, and the generator gives an error.

**Non-Goals:**

- A change to the Godot renderer or the PixiJS renderer. See "Decisions" and "Follow-up".
- A change to a label that gives a name that starts with a digit. See "Decisions".
- A change to the name rule `fieldName`.

## Decisions

### 1. A field with an empty name gives no prop and a warning

**Proposed.** The field gives no prop, the page gives one warning for the field, and the page continues to draw. This is the rule for a reserved name.

Reasons:

- `""` is not a name that a view can read with a destructuring pattern, and the generator cannot write it as a member of `Props`. A prop that no typed view can use has no value.
- The Godot renderer gives no prop for such a field. The rule agrees with it.
- One rule for each label that the generator refuses and that the renderer cannot use is easy to learn.

Alternatives:

- Keep the prop `""` and add a warning. Rejected: the renderer and the generator still do not agree, and the Godot renderer does not agree.
- Stop the draw of the view. Rejected: the page draws through a problem in the model for each other case (a reserved name, the same name, a component type with no definition).

### 2. One warning for each field, with no same-name warning

Each field whose label gives an empty name gets its own warning. Two such fields do not give a `same-name` warning: they give no prop, so no prop has two values. `propNames` already gives one `empty-name` problem for each field and no `same-name` problem for `""`. The change keeps that.

### 3. The warning has the kind `empty-name` and no name

`ViewWarning` gets the kind `empty-name`, with `fields: [<field ID>]` and no `name`. The sort of the warnings does not change: a warning with no name sorts as the name `""`.

The line in the browser console:

```text
wishem: the sidecar AppBar.view.json: the label of the field fld_5d6e7f80-9a1b-4c2d-8e3f-4a5b6c7d8e9f of the component type ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34 gives an empty name. The view does not get the field.
```

The last sentence is the same as the sentence of the warning for a reserved name.

### 4. The generator does not change

The generator already reports an error for an empty name and writes no file. The change adds a scenario to the specification `wishem/renderer-html/view-types`. The test `gives an error for an empty name` in `view-types.test.ts` already proves it.

### 5. A name that starts with a digit keeps its prop

A label such as `2nd line` gives the name `2ndLine`. The renderer gives the prop `2ndLine` with no warning, and the generator gives an error. This change does not change that. Reasons: the specification `wishem/renderer-html/views` gives the renderer a prop for that field, a view can read `props['2ndLine']`, and the issue #657 names only the empty name. The difference is that the generator cannot write the name as a TypeScript member. It is not a fault of the renderer.

### 6. The Godot renderer and the PixiJS renderer do not change

The Godot renderer already gives no prop. It gives no message, and it has no warning for a reserved name or for the same name either. A warning in Godot is a part of the parity of the messages of the three renderers, which #542 owns. The PixiJS renderer gives the prop `""`: its specification `wishem/renderer-pixi/renderer` gives one prop for each field, and the change of that specification and of its copy of `propNames` belongs to #542 as well. Reason: the smallest change that makes the specifications and the React renderer agree touches one package.

### 7. No question for the owner

The decision 1 does not meet the conditions of "When to ask the owner" in `nodejs/wishem/docs/autonomous-flow.md`. Its result is easy to change later: one function and one kind of warning in a private package.

## Interfaces

Package `@thrashplay/wishem-renderer-react`. The signatures do not change. The type `ViewWarning` gets one kind:

```ts
export interface ViewWarning {
  kind: 'component-type-not-defined' | 'same-name' | 'reserved-name' | 'empty-name' | 'reference-cycle'
  sidecar: string
  componentType: Id
  /** Set for `same-name`. One field for `reserved-name`, `empty-name`, and `reference-cycle`. */
  fields?: [Id, Id] | [Id]
  /** Set for `same-name` and `reserved-name`. */
  name?: string
  /** Set for `reference-cycle`: the entity that holds, and the entity that it names. */
  entities?: [Id, Id]
}
```

`propNames(definition).props` has no entry with the name `""`. `propNames(definition).problems` does not change.

## Package Impact

| Package                             | Published or private | Bump  | Why                                                                                               |
| ----------------------------------- | -------------------- | ----- | ------------------------------------------------------------------------------------------------- |
| `@thrashplay/wishem-renderer-react` | private              | patch | A field with an empty name gives no prop and a warning. `ViewWarning` gets the kind `empty-name`. |

No other package changes. `@thrashplay/wishem-workbench-app` uses the renderer, but its views have no field with an empty name, so its behavior does not change.

## Risks / Trade-offs

- [A view that reads the prop `""` gets no value] → No view of the repository reads it, and the generator never gave it a type.
- [The PixiJS renderer and the React renderer do not agree until #542] → "Follow-up" records it.

## Migration Plan

None. The package is private.

## The test guide

The final reviewer does these steps on the branch with real processes, real files, and a real web browser, and reports the real result of each step. Run each command from the root of the worktree. Terminal 1 runs the workbench. Terminal 2 runs commands.

### 0. Prepare

```sh
pnpm install
pnpm build --filter "@thrashplay/wishem-*"
rm -rf /tmp/657-model
cp -r nodejs/wishem/workbench/model /tmp/657-model
```

Result: the build ends with each task successful.

### 1. The tests of the package

```sh
flock -w 15 /tmp/wishem-heavy.lock timeout 140 pnpm --filter @thrashplay/wishem-renderer-react exec vitest run src/field-names.test.ts src/view-warnings.test.ts src/view-tools.test.ts src/Renderer.test.tsx src/view-types.test.ts
```

Result: each test passes. The output has these tests: `gives no prop for an empty name, and reports it` (`field-names.test.ts`), `gives one warning with the field ID for a label that gives an empty name` (`view-warnings.test.ts`), and `gives the view no prop for a field with an empty name, and warns` (`Renderer.test.tsx`).

### 2. Start the workbench

Terminal 1:

```sh
pnpm --filter @thrashplay/wishem-workbench-app start --model /tmp/657-model
```

Result: `wishem: model /tmp/657-model`, `wishem: link at ws://127.0.0.1:4747/link`, and `wishem: workbench at http://127.0.0.1:5173/`. Open `http://127.0.0.1:5173/` and the developer tools. Result: the bar shows `wishem.`, and the console has no line that starts with `wishem:`.

### 3. A hand edit adds a field with an empty name

Terminal 2:

```sh
cat > /tmp/657-model/definitions/ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34.json <<'EOF'
{
  "id": "ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34",
  "label": "AppBar",
  "fields": [
    { "id": "fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62", "label": "title", "type": "string" },
    { "id": "fld_5d6e7f80-9a1b-4c2d-8e3f-4a5b6c7d8e9f", "label": "???", "type": "string" }
  ]
}
EOF
git status --short nodejs/wishem/workbench-app/src/views
```

Result:

- Terminal 1: `wishem: error: AppBar.view.json: the label of the field fld_5d6e7f80-9a1b-4c2d-8e3f-4a5b6c7d8e9f of the component type ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34 gives an empty name`.
- `git status` prints nothing: the generator wrote no file.
- The page does not reload. The console has one line: `wishem: the sidecar AppBar.view.json: the label of the field fld_5d6e7f80-9a1b-4c2d-8e3f-4a5b6c7d8e9f of the component type ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34 gives an empty name. The view does not get the field.`
- The bar shows `wishem.`. Select the title, type `Still works`, and press Enter. The bar shows `still works.`, and `grep -c '"Still works"' /tmp/657-model/state.json` prints `1`.

### 4. A second hand edit removes the field

Terminal 2:

```sh
cp nodejs/wishem/workbench/model/definitions/ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34.json /tmp/657-model/definitions/
git status --short nodejs/wishem/workbench-app/src/views
```

Result: terminal 1 prints no `wishem: error:` line, `git status` prints nothing, the console of the page gets no new `wishem:` line, and the bar shows `still works.`.

Press Ctrl+C in terminal 1.

## Follow-up

- The PixiJS renderer gives the prop `""` for a field with an empty name, and gives no warning (`nodejs/wishem/renderer-pixi/src/field-names.ts`). The lead agent adds this to #542, or creates a `Bug` issue for it in the milestone of #542.
- The Godot renderer gives no warning for a field with an empty name, a reserved name, or the same name. #542 owns the parity of the messages.
- The README of `workbench-app` lists the labels that give no usable name, and it omits the reserved name. This change does not correct it. The lead agent creates a follow-up issue in `[WSH] R1 Tech Debt`.
