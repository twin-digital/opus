# Design

## Context

See `proposal.md`, "Why". The current state of the three views:

- `three-renderers/src/views/ClearColor.tsx` puts the value in the CSS property `background-color`. With no value, it draws nothing, and the box shows the background of the page (light or dark theme). The browser decides what a color is: a CSS name, `rgb(...)`, and `#rrggbbaa` are colors, and `1d4ed8` is not.
- `pixi-page/src/views/ClearColor.ts` converts the value with `new Color(value)` of PixiJS. When PixiJS cannot convert it, the sprite is hidden, and the canvas shows the black background of PixiJS. PixiJS reads `1d4ed8`, CSS names, and `rgb(...)`. The tint drops the alpha, so `#1d4ed880` is opaque.
- `renderer-godot/godot/views/ClearColor.gd` uses `Color.html_is_valid` and `Color.html`. When the value is not valid, the node is hidden, and the viewport shows the clear color of Godot (`#4d4d4d`). Godot reads `1d4ed8` and `#1d4ed880` (with the alpha), and no CSS name.
- The model schema says only that the field `color` of the component type `Color` is a `string` (`sample-product/model/definitions/ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512.json`). `core` has no color type. Each value of the model and of the color behavior (`COLORS`) is `#rrggbb` in lower case.
- A field whose label gives an empty name gives no prop in each of the three renderers (#657, #663, and `views.gd` of Godot). For a view, that is the same as no value.
- The three specifications of the views disagree: React draws nothing for no value; PixiJS draws nothing and shows the background of PixiJS; Godot hides its node.

## Goals / Non-Goals

**Goals:**

- One rule for "a color" and one fallback picture, the same in React, PixiJS, and GDScript.
- One table of cases that the tests of the three views check, so that a difference between the copies fails a unit test.
- The test from end to end proves that the three pictures agree for a value that is not a color, for no value, and for a label that gives an empty name.

**Non-Goals:**

- A color field type in `core`, or a check of the value in the store. The store still accepts each text in the field `color`.
- The picture before the first link, and the picture of a model with no `Color` component. These pictures still differ between the renderers.
- The `ClearColor` view of the workbench that #539 adds (`sample-product/views/react/ClearColor.tsx`). See "Follow-up".
- A warning for a value that is not a color.
- The warning of the Godot renderer for a label that gives an empty name (#732).

## Approaches

The lead agent did the brainstorm alone, as `autonomous-flow.md` says.

- **A. The rule in each view, one table of cases in the sample product (selected).** Each of the three views holds its own copy of the rule: one regular expression and one fallback color. The sample product exports the table of cases from a subpath. The tests of each view check each case, and the GDScript tests read a JSON copy of the table that a TypeScript test compares with the table. Reason: no new import at run time, so no relationship of the architecture changes. Each copy is two lines, and the table is the one source of the rule.
- **B. One function `viewColor` in the sample product that the React view and the PixiJS view import.** Rejected: it adds two relationships at run time (the React page and the PixiJS page to `sample-product`), so the container diagram and its render change, in the same files that #650 changes. The GDScript copy stays, so the table and its JSON copy are still necessary. The gain is one copy of two lines.
- **C. Three copies with no shared table.** Rejected: nothing proves that the three copies agree. The tests of each view can test different cases, and the copies can drift.

## Decisions

### 1. A color is `#rrggbb`

A value is a color when it is text that matches `^#[0-9a-fA-F]{6}$`. The view draws the color in lower case.

- Reason: each value of the model folder and of the color behavior has this form. React, PixiJS, and Godot each read it with no loss. The Godot shot line and the test from end to end compare `#rrggbb`. Upper case costs nothing: each of the three parsers reads it.
- Rejected: `#rrggbbaa`. A color with transparency shows the background below the view, and the three backgrounds differ (the theme of the page, the black of PixiJS, the gray of Godot). The PixiJS tint also drops the alpha. Three pictures would differ again.
- Rejected: CSS names and `rgb(...)`. Godot reads no CSS name, and the lists of names of the three libraries differ. A list of our own for three languages costs more than the sample needs.
- Rejected: `#rgb` and `rrggbb` with no `#`. One form is easier to test and to explain. The model and the behavior never use another form.
- Rejected: a check in the store or a color type in `core`. The field type `string` is a contract of `core` for each product. A color type is a feature of the model for a later product. The views still need a fallback for a value that a hand edit or an old model gives.

### 2. One fallback color: `#ff00ff`

For no value and for a value that is not a color, each view fills the full viewport with `#ff00ff`, opaque. No view is hidden.

- Reason: a stated color is the same in the three renderers, with no change to a page, a canvas, or a Godot project. Magenta is not a color of the sample product, not the background of a renderer, and not a color that a person usually selects. Thus a person sees at once that the value is not a color, and a test can tell "the view drew the fallback" from "the view drew nothing". Many game tools use magenta for a missing texture.
- Rejected: black `#000000`. It is the background of PixiJS, so a PixiJS view that draws nothing gives the same picture, and the test cannot find that fault. A person can also set `#000000` as a real color.
- Rejected: "no view drawn" with one stated background. Each renderer must then set the same background: the box of the React page (in place of the theme), the background of the PixiJS application, and the clear color of `project.godot`. That is three more files, and the picture of "no value" is equal to the picture of "nothing drawn", which the test then cannot tell apart from a hidden view.
- Rejected: the Godot gray `#4d4d4d` or the page background. Each is the default of one library only.

### 3. A label that gives an empty name is "no value"

Such a field gives no prop to the view (#657, #663, `views.gd`). The view reads no `color` and draws the fallback color. The renderers do not change. The React page and the PixiJS page still give their warning in the console. The Godot application gives no warning (#732).

### 4. Where each copy of the rule lives

| Copy               | File                                                   | Form                                                                  |
| ------------------ | ------------------------------------------------------ | --------------------------------------------------------------------- |
| React              | `three-renderers/src/views/ClearColor.tsx`             | `/^#[0-9a-f]{6}$/i`, `typeof color === 'string'`, fallback `#ff00ff`  |
| PixiJS             | `pixi-page/src/views/ClearColor.ts`                    | The same expression. The tint is `Number.parseInt(hex.slice(1), 16)`. |
| GDScript           | `renderer-godot/godot/views/ClearColor.gd`             | `RegEx` with `^#[0-9a-fA-F]{6}$`, `typeof(color) == TYPE_STRING`      |
| The table of cases | `sample-product/src/color-cases.ts`                    | `COLOR_CASES` and `FALLBACK_COLOR`                                    |
| The copy for Godot | `renderer-godot/godot/tests/fixtures/color-cases.json` | JSON, equal to `COLOR_CASES`                                          |

- The PixiJS view no longer uses `Color` of PixiJS to read the value, because `Color` accepts forms that the rule refuses.
- The Godot view uses `Color.html` only for a value that matches the expression.
- The views do not import `FALLBACK_COLOR` from the sample product (approach A). The tests compare the fallback of each view with it.
- The table is in the subpath `color-cases`, not in the root entry. It is data for tests, and the product code of the sample product (`behaviors`) does not need it. The export `./*` of `package.json` already gives the subpath, so `package.json` does not change.

### 5. How the tests prove that the three agree

- `sample-product/src/color-cases.test.ts`: each color of `COLORS` is a case that gives itself; the fallback is not in `COLORS`; each `color` of the table is `#rrggbb` in lower case; the table holds no value, `#1D4ED8`, `red`, `rgb(29, 78, 216)`, `transparent`, `#fff`, `#1d4ed880`, and `1d4ed8` (the values of the issue).
- `three-renderers/src/views/ClearColor.test.tsx`: for each case, the `div` fills the box, and its `backgroundColor` is the RGB form of the color of the case.
- `pixi-page/src/views/ClearColor.test.ts`: for each case, the sprite is visible, covers the viewport, and has the tint of the color of the case.
- `renderer-godot/src/color-cases.test.ts`: the fixture is equal to `COLOR_CASES`, as `src/link-examples.test.ts` does for the link examples.
- `renderer-godot/godot/tests/test_clear_color.gd`: for each case of the fixture, the node is visible, covers the viewport, and has `Color.html(<color of the case>)`, with an alpha of 1.
- `three-renderers/tests/three-renderers.guide.ui.test.ts`: the real processes and pixels (decision 7).

A change of the rule in one copy fails the unit test of that package. A change of the table fails the test of the Godot fixture until the fixture changes too.

### 6. The table of cases

| Name                 | Value              | Color     |
| -------------------- | ------------------ | --------- |
| each color of COLORS | `#1d4ed8`, ...     | the same  |
| black                | `#000000`          | `#000000` |
| upper case           | `#1D4ED8`          | `#1d4ed8` |
| no value             | (no `value` key)   | `#ff00ff` |
| empty text           | `''`               | `#ff00ff` |
| CSS name             | `red`              | `#ff00ff` |
| CSS name             | `transparent`      | `#ff00ff` |
| CSS function         | `rgb(29, 78, 216)` | `#ff00ff` |
| short form           | `#fff`             | `#ff00ff` |
| with alpha           | `#1d4ed880`        | `#ff00ff` |
| no hash sign         | `1d4ed8`           | `#ff00ff` |
| not hexadecimal      | `#1d4eg8`          | `#ff00ff` |
| a space before       | ` #1d4ed8`         | `#ff00ff` |
| a space after        | `#1d4ed8 `         | `#ff00ff` |
| free text            | `blue-ish`         | `#ff00ff` |
| a number             | `5`                | `#ff00ff` |
| a boolean            | `true`             | `#ff00ff` |

The "no value" case has no `value` key, so that the JSON copy can hold it. The names of the cases are unique, so that a failed test names its case.

### 7. The steps of the test from end to end

The test gets steps 14 to 17 after step 13 of `three-renderers.guide.ui.test.ts`, while the clock is stopped. The steps use the same processes, so the test takes only a few seconds more. Each input goes through the link of the test with `storeInputs()` of `core`:

14. `setField` of the color to `red`. Each picture is `#ff00ff`.
15. `setField` of the color to `#15803d`. Each picture is `#15803d`. This proves that a view draws a color again after the fallback.
16. `replaceModel` with the model of `port.read().store`, but with no value for the field `color` of the sample entity. Each picture is `#ff00ff`.
    16b. `replaceModel` with that model, but with a valid label and the value `#15803d`. Each picture is `#15803d`. Step 17 starts from a different color, so a stale fallback picture cannot pass it.
17. `replaceModel` with that model, but with the label `???` for the field `color` and the value `#1d4ed8`. Each picture is `#ff00ff`.

- `store/set-field` and `store/replace-model` are accepted from each input subsystem. Only `hub/rewind` has a list of sources.
- No input clears one field (#607), so step 16 uses `replaceModel`.
- Before the change, steps 14 and 16 fail in the three renderers, and step 17 fails in React and in Godot (the table of #743).
- The color behavior writes the field `color` only at a tick. The clock is stopped, so the values stay.

### 8. The entity at a point

A view with the fallback color is visible. Thus `entityAt` of the PixiJS renderer and `entity_at` of the Godot renderer give the sample entity at a point for each value, also for a value that is not a color. Before the change they gave no value, because the view was hidden. The specifications of the renderers say "visible", so they do not change.

### 9. The blueprint and the documents

- No blueprint text changes. `rules.md` has no rule about colors, and no line that starts with "Rejected:" covers this change.
- The glossary gets no term. The fallback color is a detail of the views of the sample product.
- The READMEs of `three-renderers` ("The React page"), `pixi-page` ("What the page shows"), `renderer-godot` ("The view ClearColor"), and `sample-product` (a new section "The color cases") give the rule and the fallback color.
- The architecture document: the row of `sample-product` names the table of color cases. The package view of the document comes from `package.json` and shows the test dependencies, so the packages `pixi-page`, `renderer-godot`, and `three-renderers` need no new line. No import at run time changes, so no diagram changes and `render.mjs` does not run.

### 10. No question for the owner

The decisions do not meet the three conditions of "When to ask the owner". A person sees the fallback color, but it is one constant in three private files and one table, so it is easy to change later.

## Interfaces

```ts
// @thrashplay/wishem-sample-product/color-cases (sample-product/src/color-cases.ts)
import type { FieldValue } from '@thrashplay/wishem-core'

/** The color that a view of the sample product draws for no value and for a value that is not `#rrggbb`. */
export const FALLBACK_COLOR = '#ff00ff'

/** One value of the field `color` and the color that a view draws for it. */
export interface ColorCase {
  /** Unique in the table. */
  readonly name: string
  /** No key for "no value". */
  readonly value?: FieldValue
  /** `#rrggbb` in lower case. */
  readonly color: string
}

/** Each case that the tests of the `ClearColor` views check. */
export const COLOR_CASES: readonly ColorCase[]
```

The three views keep their current signatures. The React view gets the type of its prop `color` as `FieldValue | undefined`, because the renderer gives the stored value as it is.

```ts
// three-renderers/src/views/ClearColor.tsx
interface Props {
  readonly color: FieldValue | undefined
  readonly wishem: ViewTools
}
```

```gdscript
# renderer-godot/godot/views/ClearColor.gd (no change of the interface of a Godot view)
func create() -> Node
func update(node: Node, props: Dictionary, viewport: Vector2) -> void
```

## Data Model

No data changes. The model folder of the sample product does not change. No component type, field, or entity is added.

## Examples

The Godot application, for a value that is not a color, after the change:

```text
wishem-godot: connected (link 2)
wishem-godot: shot 3 seq 0 color #ff00ff file /workspace/opus/nodejs/wishem/renderer-godot/shots/0003.png
```

Before the change, the same model gave `color #4d4d4d`.

## Failure Modes

| Failure                                           | Result                                                                        | Recovery                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
| A value that is not text (a number or a boolean)  | Each view draws `#ff00ff`. No error.                                          | None necessary.                                               |
| The JSON copy for Godot is not equal to the table | `renderer-godot/src/color-cases.test.ts` fails.                               | Copy the table again.                                         |
| `store/replace-model` is refused in step 16 or 17 | The test fails with the problems of the refusal.                              | The implementer reads the problems and makes a correct model. |
| A view draws the fallback for a real color        | The case of that color fails in the unit test of the view, and step 15 fails. | Correct the copy of the rule.                                 |

## Package Impact

| Package                              | Published or private | Bump  | Why                                                                                                         |
| ------------------------------------ | -------------------- | ----- | ----------------------------------------------------------------------------------------------------------- |
| `@thrashplay/wishem-sample-product`  | Private              | minor | New subpath export `color-cases` with `COLOR_CASES` and `FALLBACK_COLOR`.                                   |
| `@thrashplay/wishem-three-renderers` | Private              | patch | The `ClearColor` view of the React page draws `#ff00ff` for no value and for a value that is not `#rrggbb`. |
| `@thrashplay/wishem-pixi-page`       | Private              | patch | The same change in the `ClearColor` view of the PixiJS page.                                                |
| `@thrashplay/wishem-renderer-godot`  | Private              | patch | The same change in the `ClearColor` view of the Godot application.                                          |

Two changesets:

1. `sample-product` (minor): the table of color cases.
2. `three-renderers`, `pixi-page`, and `renderer-godot` (patch): the same rule in the three `ClearColor` views. It is one change in three packages.

No other package changes. `core`, `hub`, `renderer-react`, `renderer-pixi`, and the renderer code of `renderer-godot` (`godot/wishem/`) do not change. No package is published.

## UI options for the owner

The config asks for two or three options of the look. The lead agent selected option A, as `autonomous-flow.md` permits.

- **A. The view fills the viewport with magenta `#ff00ff` (selected).** See decision 2.
- **B. The view fills the viewport with black.** Rejected: the same picture as a PixiJS view that draws nothing, and the same as a real color.
- **C. The view draws nothing, on one stated background.** Rejected: three more files, and a hidden view gives the same picture.

## UI

The pages and the Godot application keep their layout. No component and no design token is added. The fallback color is a value of the views of the sample product, like the colors of the model, and not a color of the workbench. The style guide of `workbench-app` and `wishem/design-system/component-catalog` do not change.

```
+--------------------------------------------------+
| box or canvas or viewport, 640 x 360             |
|                                                  |
|   a color (#rrggbb)        -> that color         |
|   no value, or not a color -> #ff00ff (magenta)  |
|                                                  |
+--------------------------------------------------+
Connected (link 1).
```

- States: the states of the pages do not change. "No value" and "not a color" show the fallback color in place of the background of the page, the black of PixiJS, or the gray of Godot.
- Narrow viewport, keyboard, and focus: no change.
- Accessibility: the box of the React page keeps `role="img"` and its label.

## Risks / Trade-offs

- [Magenta is loud for a component that has no value on purpose] → The sample product always has a value. A real product gets its own views and its own rule.
- [Three copies of the rule] → The table and the unit tests of each copy keep them equal. A fourth copy (the workbench view of #539) is a follow-up.
- [The test from end to end gets four more steps] → The steps use the same processes, and each check waits at most 5 seconds.
- [The flake of #712 at the start of the PixiJS page] → The new steps run after the start, so they do not change it. A flake fails the whole test, as before.

## Migration Plan

No data changes. To roll back, revert the pull request.

## Order with other changes

- **#539 (workbench run controls, in apply).** It changes `sample-product/README.md`, `package.json`, `src/root-entry.test.ts`, and adds `sample-product/views/react/`. This change adds `sample-product/src/color-cases.ts` and a section of `sample-product/README.md`. Either order works. The second to merge merges `main` and keeps both README sections. `src/index.ts` does not change in this change.
- **#708 (renderer-pixi warnings, finishing).** No overlap: this change does not change `renderer-pixi`.
- **#744 (pixi-page reload on restore, in progress).** It changes `pixi-page/README.md`, `src/main.ts`, and the main spec `wishem/renderer-pixi/page` (a new requirement). This change changes `pixi-page/README.md` ("What the page shows") and the requirement "The ClearColor view fills the viewport" of the same spec. Either order works. If #744 merges first, merge `main` before the archive, and read the main spec again: the delta must copy the current text of the requirement.
- **#735 (proxy noise of pixi-page and three-renderers, next).** It changes the page servers (`scripts/start.ts`, `scripts/react-page.ts`, and the Vite configuration), and maybe the READMEs. This change changes no page server. If both change a README, the second to merge merges `main`.
- **#740 (break-test after #542: `construct-manager`, `sample-product`).** This change adds a file to `sample-product`. Do not run the `sample-product` pass of #740 while this change is in apply.
- **#650 (architecture diagrams).** This change changes only the text of `docs/architecture/README.md` (the row of `sample-product`), not `render.mjs` or a diagram. The second to merge merges `main`.
- **#745 (small findings of the A5 review).** M6 and M7 change other lines of `docs/architecture/README.md`. M8 changes line 146 of `renderer-godot/README.md`, near the section that this change changes. The second to merge merges `main`.

## Open issues of the same files or behavior

- **#745 M1 (Minor, a fault of the PixiJS renderer):** after a failed update, the renderer makes visible an object that its view hid. `ClearColor` hides no object after this change, so the wrong picture of M1 does not occur for `ClearColor`. The fault of the renderer stays for other views. This change does not correct it. #745 keeps it.
- **#745 M15:** the Godot specification of the props does not say that a label that gives an empty name gives no prop. This change uses that behavior of the code and does not change that requirement. #745 keeps it.
- **#712 (Bug):** the test from end to end failed one time at the start of the PixiJS page. This change adds steps to the same test file, after the start. It does not correct #712.
- **#735 (Bug):** the page servers print a Vite proxy stack trace at each retry. The test guide of this change stops and starts the construct, so terminals 2 and 3 show those lines. This change does not correct #735.
- **#744 (Bug):** see "Order with other changes". No overlap of behavior.
- **#732 (Task):** the Godot renderer gives no warning for a label that gives an empty name. Step 6 of the test guide shows it. This change does not correct it.
- **#607 (Feature):** no input clears one field. Step 16 of the test uses `store/replace-model`.

## The test guide

The final reviewer does these steps on the branch with real processes, real files, and a real web browser, and reports the real result of each step. Run each command from the root of the worktree. The terminals 1 to 4 run one command each. Terminal 5 runs the other commands. Each result is the result after the change. The result before the change, from the table of #743, is in the line "Before".

What a person needs: the checkout, Node.js 24, pnpm, Docker, and a web browser on the same computer.

### 1. Prepare

1. `pnpm install`, then `pnpm build --filter "@thrashplay/wishem-three-renderers..."`, then `pnpm --filter @thrashplay/wishem-renderer-godot godot:image`. Result: the build ends with no error, and the terminal shows `wishem-godot: image wishem-godot:<tag> is ready`.

### 2. Start the four parts

1. Terminal 1: `pnpm --filter @thrashplay/wishem-three-renderers construct --paused`. Result: `wishem: link at ws://127.0.0.1:4750/link` and `wishem: the time of the construct starts paused`.
2. Terminal 2: `pnpm --filter @thrashplay/wishem-three-renderers react-page`. Terminal 3: `pnpm --filter @thrashplay/wishem-pixi-page start`. Terminal 4: `pnpm --filter @thrashplay/wishem-renderer-godot godot`.
3. Open `http://127.0.0.1:5175/` and `http://127.0.0.1:5174/`. Result: the React box and the PixiJS canvas are blue `#1d4ed8`. Terminal 4 shows `shot 1 seq 0 color #1d4ed8`.

### 3. A hand edit that is not a color

1. Terminal 1: Ctrl+C.
2. Terminal 5: `sed -i 's/"#1d4ed8"/"red"/' nodejs/wishem/sample-product/model/state.json`
3. Terminal 1: start the construct again (step 2.1).
4. Result: in less than 10 seconds, the React page says "Connected (link 2).", the PixiJS page says "Connected (link 2). Space: pause or run. Period: one step.", and the box and the canvas are magenta `#ff00ff`. Terminal 4 shows `connected (link 2)` and `shot ... seq 0 color #ff00ff`. Before: React red, PixiJS red, Godot gray `#4d4d4d`.
5. Do steps 1 to 4 again for each of these values. Replace `red` in the `sed` command with the value of the last run, and `"red"` with the new value: `rgb(29, 78, 216)`, `1d4ed8`, `#1d4ed880`, `transparent`. Result: each time, the three pictures are `#ff00ff`. Before: see the table of #743.

### 4. A tick after a value that is not a color

1. With the construct of step 3 running, terminal 5: `node nodejs/wishem/docs/milestones/a5-renderers/time-client.mjs step`. Result: `result: {"ok":true,"seq":1}`. In less than 2 seconds, the three pictures are red `#b91c1c`. The color behavior wrote a color, and each view draws it.

### 5. No value

1. Terminal 1: Ctrl+C. Terminal 5: `git checkout nodejs/wishem/sample-product/model/state.json`, then `sed -i 's/"fld_694d6cb2-97e8-444e-961e-aa76744837fb": "#1d4ed8"//' nodejs/wishem/sample-product/model/state.json`.
2. Terminal 1: start the construct again. Result: the three pictures are `#ff00ff`, and no error shows in the console of the two pages or in terminal 4. Before: React shows the background of the page, PixiJS black, Godot gray.

### 6. A label that gives an empty name

1. Terminal 1: Ctrl+C. Terminal 5: `git checkout nodejs/wishem/sample-product/model/state.json`, then `sed -i 's/"label": "color"/"label": "???"/' nodejs/wishem/sample-product/model/definitions/ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512.json`.
2. Terminal 1: start the construct again. Reload the two tabs.
3. Result: the three pictures are `#ff00ff`. The console of each page has one line `wishem: the sidecar ClearColor.view.json: the label of the field fld_694d6cb2-97e8-444e-961e-aa76744837fb of the component type ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512 gives an empty name. The view does not get the field.` Terminal 4 shows no warning (#732). Before: React the background of the page, PixiJS black, Godot gray.

### 7. Remove the edits

1. Terminal 1: Ctrl+C. Terminal 5: `git checkout nodejs/wishem/sample-product/model/`, then `git status --short`. Result: no line for `nodejs/wishem/sample-product/`.
2. Terminal 1: start the construct again. Result: the three pictures are blue again.
3. Stop each terminal with Ctrl+C. Result: each command ends with exit code 0, and `docker ps -a --filter name=wishem-godot` shows no container.

### 8. The automatic tests

1. `pnpm --filter @thrashplay/wishem-three-renderers test:ui`. Result: each test passes, and the test "the three renderers draw the state of the hub" holds steps 14 to 17.
2. `pnpm --filter @thrashplay/wishem-renderer-godot test:ui`. Result: the GDScript tests end with `0 failed`, with more tests than 128, and the screenshot test passes.
3. `pnpm --filter @thrashplay/wishem-pixi-page test:ui`. Result: `2 passed`, with the baselines as they are.

Steps 3 to 6 are hand edits of the model folder with a stop and a start of the construct. The automatic test does the same changes through the link (decision 7), because the sample construct reads its model folder at a fixed path in the repository, and a test must not edit that folder. Both paths go through the same store and the same views.

## Follow-up

- An issue (Task, `[WSH] R1 Tech Debt`): the `ClearColor` view of the workbench (`sample-product/views/react/ClearColor.tsx`, from #539) follows the rule of `wishem/renderers/sample-construct` and checks `COLOR_CASES`. Create it when both changes are on `main`.
