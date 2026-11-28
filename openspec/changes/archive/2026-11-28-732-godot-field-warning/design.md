# Design

## Context

See proposal.md, "Why". The facts that shape the approach:

- `Views.field_name` in `nodejs/wishem/renderer-godot/godot/wishem/views.gd` gives the name of a prop, with the rule of `wishem/renderer-html/view-types`. `Views.props` skips a field whose name is empty or whose name an earlier field has, with no message. Its tests are in `godot/tests/test_views.gd`.
- `renderer.gd` calls `_sync` at the start and after each event of the port. `_sync` returns at once when the part `store` is the same object. The renderer keeps the text of each error that it wrote in `errors`, and writes each error with `push_error`. It has no warning.
- The table of views of `Views.collect_views` is `{ <component type ID>: { "sidecar": String, "view": RefCounted } }`.
- `godot/main.gd` makes a new renderer after each `welcome` (`_on_linked`), and stops the old one.
- `viewWarnings` and `describeWarning` of `renderer-react` and of `renderer-pixi` (`src/view-warnings.ts`) give the three lines below. `renderer-pixi` has the three kinds `component-type-not-defined`, `same-name`, and `empty-name`, and no reserved name. Both renderers sort by sidecar, component type, name (`''` when the warning has no name), and kind, with a stable sort. Both write the lines only when their joined text differs from the last text, and write no line when the part `store` is absent (the archived changes `2026-11-28-663-pixi-empty-field-name` and `2026-11-28-708-pixi-view-warnings`).

  ```text
  wishem: the sidecar <sidecar> names the component type <component type ID>, which no definition has. No view is drawn for it.
  wishem: the sidecar <sidecar>: the fields <first field ID> and <second field ID> of the component type <component type ID> give the same name "<name>". The prop has the value of the first field.
  wishem: the sidecar <sidecar>: the label of the field <field ID> of the component type <component type ID> gives an empty name. The view does not get the field.
  ```

- A real run of `push_warning("wishem: probe line")` in the image `wishem-godot:4.7.2-833918f15432` (Godot `v4.7.2.stable.official.ed1daf0bf`) wrote these lines to the standard error, and no line with `SCRIPT ERROR`:

  ```text
  WARNING: wishem: probe line
       at: push_warning (core/variant/variant_utility.cpp:1033)
       GDScript backtrace (most recent call first):
           [0] _initialize (res://probe.gd:5)
  ```

  `run-godot.ts` gives each line of the standard output and of the standard error to `log`. The command `godot` thus shows the warning in the terminal. `scripts/godot.ts test` fails only for a line with `SCRIPT ERROR`, so a warning does not fail the GDScript tests.

## Goals / Non-Goals

**Goals:**

- The Godot renderer gives the warnings `empty-name`, `component-type-not-defined`, and `same-name` with the lines, the order, the rule for an absent part `store`, and the rule for a text that does not change of the React and PixiJS renderers.
- The Godot specification says that a label with an empty name gives no prop (#745, item M15).
- An automated test with real processes for each step of "The test guide" that a program can do.

**Non-Goals:**

- The warnings `reserved-name` and `reference-cycle`. The Godot renderer has no reserved prop and no prop that holds a picture.
- A warning for a name that starts with a digit. No renderer gives one.
- A change to `renderer-react`, `renderer-pixi`, or the errors of `collect_views`.
- A shared source of the rule of the names for the three renderers. GDScript cannot import a TypeScript module (the archived change 708, decision 1).

## Decisions

### 1. The three warnings of the PixiJS renderer, in one change

The Godot renderer gets `empty-name` (the issue), `component-type-not-defined`, and `same-name`. Reason: the three renderers then agree. The review of A5 (#745, M15) lists the difference of the three renderers as one finding. Each of the two extra warnings is a few lines in the same functions and the same tests. A second change for them would repeat the plan, the review, and the wait for the checks.

Alternative: only `empty-name`, as the issue says. Rejected: the Godot renderer would still skip a second label with the same name with no message, and draw nothing for a sidecar with no definition with no message. Each is the same fault as the issue.

### 2. The same text as the other renderers, with `push_warning`

The renderer writes each line with `push_warning(line)`, and the line is the exact text of `describeWarning` of `renderer-react`, with the prefix `wishem:`. Godot adds `WARNING:` in front, and the lines `at:` and the backtrace after it (see "Context"). Reason: the issue asks for `push_warning` and the same text. A warning of Godot goes to the debugger and to the editor, and a person can find it by its text in each renderer.

Alternatives:

- `print` with the prefix `wishem-godot:`, as the lines of the application. Rejected: the text is then different from the other renderers, and a warning is not a line of the state of the application. The line `wishem-godot: wishem: …` of an error of `collect_views` stays as it is.
- `push_error`. Rejected: the renderer continues to draw, so the problem is a warning, as in the other renderers.

### 3. The pure functions: `Views.prop_names` and a new file `view_warnings.gd`

- `Views.prop_names(definition)` gives `{ "names": [{ "name": String, "field": Dictionary }], "problems": [Dictionary] }`, the copy of `propNames` of `renderer-pixi`: one entry in `names` for each name, the first field for two fields with one name, and no entry for an empty name. A problem is `{ "kind": "empty-name", "field": <ID> }` or `{ "kind": "same-name", "name": String, "fields": [<earlier ID>, <later ID>] }`. `Views.props` uses `prop_names`, so the props and the warnings have one rule.
- `godot/wishem/view_warnings.gd` holds `view_warnings(views, definitions) -> Array` (the warnings as dictionaries, sorted) and `describe_warning(warning) -> String` (one line). It has the shape of `view-warnings.ts`: a warning is `{ "kind", "sidecar", "componentType" }`, with `"fields"` for `same-name` and `empty-name`, and `"name"` for `same-name`.

Reason: the same split and the same shape as the TypeScript copies make the three copies easy to compare in a review. The functions are static and have no state, so a GDScript test checks them with no port.

Alternative: the warnings in `views.gd`. Rejected: `views.gd` is the table of views and the props. The warnings read the table and the definitions together, as `view-warnings.ts` does.

### 4. When the renderer writes: after each new part `store`, only when the text changes

In `_sync`, after the check of identity, the renderer computes the lines when the part `store` is a dictionary. With no part `store`, the list of lines is empty. When the lines joined with `"\n"` differ from the last text, the renderer keeps the new text, writes each line with `push_warning`, and appends each line to `warnings`. Reason: the rule of `startRenderer` of `renderer-pixi` and of `Renderer` of `renderer-react`. An input that changes only a value of a field gives the same text, so no line repeats at each tick.

Each renderer has its own last text. The application makes a new renderer after each `welcome`, so a new link writes the warnings one more time. Reason: a person who reads the output after a new link sees the problems of the new construct. The PixiJS page does the same with each new renderer.

`warnings` holds the text of each warning that the renderer wrote, in order, as `errors` holds each error. Reason: a GDScript test cannot read the output of `push_warning`, and the field has the form of `errors`.

Alternative: an option of the renderer for a function that writes the warnings. Rejected: the archived change 663 (decision 2) rejected the option `onWarning` for the PixiJS renderer, and `errors` already gives the pattern of a field.

### 5. A sort that keeps the order of the fields

`view_warnings` sorts with `sort_custom` by sidecar, component type, name (`""` when the warning has no name), kind, and then the position of the warning before the sort. Reason: `Array.sort_custom` of Godot is not stable. The TypeScript copies keep the order of the fields of two warnings `empty-name` of one component type with a stable sort. The last key gives the same result in GDScript. The comparison of `String` in GDScript compares the code points. For the IDs, the names (only `A-Z`, `a-z`, and `0-9`), and the file names of the sidecars (ASCII), the order is the same as the order of `<` in TypeScript.

### 6. The tests

- GDScript, `godot/tests/test_views.gd`: `prop_names` for each problem, and `props` for a label that starts with a digit.
- GDScript, a new file `godot/tests/test_view_warnings.gd`: each kind, each exact line, and the order.
- GDScript, `godot/tests/test_renderer.gd`: the renderer with `FakePort` and a table from `Views.collect_from` of `godot/tests/views/ok` (the real sidecars `Box.view.json` and `Ring.view.json`). Each test reads `renderer.warnings` after the start, after a `FakePort.apply` that changes only a value, and after a `FakePort.apply` that changes the definitions.
- Node.js, `tests/godot.ui.test.ts`: a second `test` with the real sample construct, the real Godot application in Docker, and the real link. It is the automated test of "The test guide" (see there). It runs after the first test of the file, so only one container runs at a time.

A test cannot catch `push_warning` in GDScript. The test with real processes proves that the line of `push_warning` reaches the output of the command. The GDScript tests prove the lines, the order, and the rule of the text.

### 7. A changed model for the sample construct of the test

`startSampleConstruct` of `tests/sample-construct.ts` gets the option `edit?: (model: Model) => Model`. The test gives a model with a removed definition, or with more fields. Reason: the runner copies the `godot/` folder of the package into the container, so a test cannot change the sidecar of the application with no change to the runner. A model with no definition of the `Color` component type gives the same line as a sidecar that names a component type that is not defined: the line names the sidecar and the component type ID only.

Alternative: an option of `runGodot` for a different folder of views. Rejected: a change of the runner and of its specification for a test only.

### 8. Three tasks, one changeset for each warning, and the test with real processes in a fourth task

Task 1 gives `empty-name` (the issue), with `prop_names`, `view_warnings.gd`, and the rule of decision 4. Task 2 adds `component-type-not-defined` and the rule for an absent part `store`. Task 3 adds `same-name` and the full sort. Task 4 adds the test with real processes, which needs the three warnings. A reviewer can reject one warning and approve the other two.

### 9. No question for the owner

The decisions do not meet the three conditions of "When to ask the owner" in `nodejs/wishem/docs/autonomous-flow.md`. They copy the rule of the other renderers, and they are easy to change later: internal files of a private package.

## Interfaces

Package `@thrashplay/wishem-renderer-godot`, GDScript files with no `class_name`. The TypeScript exports of the package do not change.

```gdscript
# godot/wishem/views.gd (new function; field_name, props, collect_views, and collect_from keep their signatures)
## Gives { "names": [{ "name": String, "field": Dictionary }], "problems": [Dictionary] }.
## A problem is { "kind": "empty-name", "field": ID } or { "kind": "same-name", "name": String, "fields": [ID, ID] }.
static func prop_names(definition: Dictionary) -> Dictionary

# godot/wishem/view_warnings.gd (new file, extends RefCounted)
## One dictionary for each warning: { "kind", "sidecar", "componentType", "fields"?, "name"? }.
## "kind" is "component-type-not-defined", "same-name", or "empty-name". Sorted as decision 5 says.
static func view_warnings(views: Dictionary, definitions: Array) -> Array
## One line, with the text of describeWarning of renderer-react.
static func describe_warning(warning: Dictionary) -> String

# godot/wishem/renderer.gd (new member)
## The text of each warning that the renderer wrote, in order.
var warnings: Array[String] = []
```

```ts
// tests/sample-construct.ts (new option)
export interface SampleConstructOptions {
  port?: number
  paused?: boolean
  /** Changes the model of the model folder before the start. */
  edit?: (model: Model) => Model
}
```

After Task 1, `view_warnings` gives only the kind `empty-name` and skips a view with no definition. After Task 2, it also gives `component-type-not-defined`.

## Package Impact

| Package                             | Published or private | Bump  | Why                                                                                       |
| ----------------------------------- | -------------------- | ----- | ----------------------------------------------------------------------------------------- |
| `@thrashplay/wishem-renderer-godot` | private              | patch | The Godot renderer warns about a label that gives an empty name (Task 1).                 |
| `@thrashplay/wishem-renderer-godot` | private              | patch | The Godot renderer warns about a sidecar whose component type has no definition (Task 2). |
| `@thrashplay/wishem-renderer-godot` | private              | patch | The Godot renderer warns about two labels that give the same name (Task 3).               |

Three changesets: `.changeset/732-renderer-godot-empty-name.md`, `.changeset/732-renderer-godot-type-not-defined.md`, and `.changeset/732-renderer-godot-same-name.md`. Task 4 changes only tests, so it has no changeset. No other package changes. No other package depends on `renderer-godot`.

## Risks / Trade-offs

- [The three copies of the rule and of the lines drift apart] → The specifications require the same text, and the tests of each package check the exact lines.
- [The GDScript tests that make a warning add the lines `WARNING:`, `at:`, and the backtrace to the output of `test:godot`] → The lines do not fail the run (no `SCRIPT ERROR`). Only the tests of the warnings make them. Each other test uses a definition with no problem.
- [The test with real processes adds one more run of Godot in Docker to the CI job `ui-tests`] → It runs after the first test, in the same file, so one container runs at a time. It uses the paused construct and waits only for lines.
- [A product whose model has a problem now gets warnings in the Godot output] → This is the purpose of the warnings. The renderer continues to draw.

## Migration Plan

None. The package is private.

## Order with other changes

- **#743 (one picture for a color that is missing or not a color, PR #749, in apply).** Its Task 4 changes `godot/views/ClearColor.gd`, `godot/tests/test_clear_color.gd`, a new fixture, `src/color-cases.test.ts`, the README of `renderer-godot` (the section "The view ClearColor"), and the requirement "The ClearColor view fills the viewport" of `wishem/renderer-godot/renderer`. This change touches neither file. Both change the README of `renderer-godot` and modify different requirements of the same specification. Order step: the change that merges second merges `main`, and resolves a conflict of the README by hand if one occurs. Before its archive, it copies the text of `main` again for each requirement that it modifies.
- **#741 (the shape of a result in the Godot client, PR #756).** It changes `godot/wishem/link_client.gd`, `godot/tests/test_link_client.gd`, and its changeset. No overlap.
- **#539 (run controls, PR #728, in apply).** It changes no file of `renderer-godot` and no file of this change. No overlap.
- **#745 (the small findings of A5).** No branch exists. This change does the Godot part of item M15: the sentence "except a field whose label gives an empty name" in "A view gets one prop for each field", and the warnings. When #745 starts, it skips M15. Item M8 changes the README of `renderer-godot` (the section "The Godot application", the label `color`). This change does not touch that section, and the test guide below uses the label `color`. Items M4 and M5 change other specifications of `renderer-godot`. No order step.
- **Open `Bug` issues of `app:wishem`.** #757 (an old view in a reloaded workbench page) is about `workbench-app`. #712 (the end-to-end test of the three renderers at the start of the PixiJS page) is about `three-renderers` and `pixi-page`. #706 (start scripts and a terminate signal) is about `pixi-page` and `three-renderers`. #692 (a UI test of the view warnings of `workbench-app`) is about the React warnings in `workbench-app`. #685 (the clock port of a product construct) is about `construct-manager`. This change does not touch them. No open `Bug` issue touches `renderer-godot`.

## The architecture document

No package, process, relationship, or import changes. The Godot application still imports no TypeScript package. `nodejs/wishem/docs/architecture/README.md` and `render.mjs` do not change. The README of `renderer-godot` gets the three warnings (Tasks 1 to 3).

## The test guide

The final reviewer does these steps on the branch with real processes and real files, and reports the real result of each step. Run each command from the root of the worktree. Terminal 1 runs the sample construct (package `three-renderers`). Terminal 2 runs the Godot application (package `renderer-godot`). Terminal 3 runs the other commands. The startup lines and the shot lines of step 2 are the lines of `main` (the README of `renderer-godot` and of `three-renderers`). Each line that starts with `WARNING: wishem:` is the result after the change. On `main`, Godot writes no such line in steps 3 to 6. The form of a warning (`WARNING:`, then a line `at: push_warning (…)` and the lines of the GDScript backtrace) comes from a real run in the image (see "Context").

### 0. Prepare

```sh
pnpm install
node nodejs/wishem/docs/flow-scripts/heavy.mjs pnpm build --filter "@thrashplay/wishem-three-renderers..."
pnpm --filter @thrashplay/wishem-renderer-godot godot:image
```

Result: the build ends with each task successful, and the last command shows `wishem-godot: image wishem-godot:<tag> is ready`. Exit code 75 of `heavy.mjs` means that the computer is busy. Then run the command again.

### 1. The tests of the package

```sh
node nodejs/wishem/docs/flow-scripts/heavy.mjs pnpm --filter @thrashplay/wishem-renderer-godot test:godot
```

Result: the output has the line `wishem-godot tests: <n> passed, 0 failed`. Godot writes more lines to stderr after it (exit lines such as `WARNING: <n> ObjectDB instances were leaked at exit`); they do not fail the run. The output has a `PASS` line for each test of `test_view_warnings.gd`, and for the tests of `test_renderer.gd` whose names start with `test_warns_` and `test_writes_no_warning_`. It has lines that start with `WARNING: wishem:`, from these tests, and no line with `SCRIPT ERROR`.

### 2. The application with no warning

Terminal 1:

```sh
pnpm --filter @thrashplay/wishem-three-renderers construct
```

Result: `wishem: link at ws://127.0.0.1:4750/link`.

Terminal 2:

```sh
pnpm --filter @thrashplay/wishem-renderer-godot godot
```

Result: `wishem-godot: connecting to ws://127.0.0.1:4750/link`, then `wishem-godot: connected (link 1)`, then two lines `wishem-godot: shot <n> seq <seq> color <#rrggbb> file <path>` each second. The colors follow the cycle `#1d4ed8`, `#b91c1c`, `#15803d`, `#a16207`. The terminal has no line that starts with `WARNING: wishem:`.

Keep terminal 1 running. Press Ctrl+C in terminal 2. This step changes no file.

### 3. A hand edit of the sidecar names a component type that is not defined

Terminal 3:

```sh
sed -i 's/"componentType": "[^"]*"/"componentType": "ct_00000000-0000-4000-8000-000000000001"/' nodejs/wishem/renderer-godot/godot/views/ClearColor.view.json
git diff --stat
```

Result: `git diff --stat` shows one file, `nodejs/wishem/renderer-godot/godot/views/ClearColor.view.json`, with one line changed.

Terminal 2: run the command of step 2 again. The runner copies the `godot/` folder with the hand edit into the container.

Result:

- After `wishem-godot: connected (link 1)`, the terminal has exactly one line that starts with `WARNING: wishem:`: `WARNING: wishem: the sidecar ClearColor.view.json names the component type ct_00000000-0000-4000-8000-000000000001, which no definition has. No view is drawn for it.` The lines `at: push_warning (…)` and the GDScript backtrace follow it.
- The shot lines continue, two each second, and their color is not one of the four colors of step 2.

### 4. The ticks do not repeat the warning

Wait five seconds.

Result: the terminal gets about ten new shot lines, and no new line that starts with `WARNING: wishem:`.

Remove the hand edit of step 3. Press Ctrl+C in terminal 2. Terminal 3:

```sh
git checkout -- nodejs/wishem/renderer-godot/godot/views/ClearColor.view.json
git status --short
```

Result: `git status --short` prints nothing.

### 5. A hand edit of the model folder gives an empty name and two labels with the same name

Press Ctrl+C in terminal 1. The sample construct reads its model folder only when it starts. Terminal 3:

```sh
sed -i 's/"type": "string" }\]/"type": "string" }, { "id": "fld_5d6e7f80-9a1b-4c2d-8e3f-4a5b6c7d8e9f", "label": "Color", "type": "string" }, { "id": "fld_0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "label": "???", "type": "string" }]/' nodejs/wishem/sample-product/model/definitions/ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512.json
git diff --stat
```

Result: `git diff --stat` shows one file, `nodejs/wishem/sample-product/model/definitions/ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512.json`, with one line changed. The definition of the `Color` component type has the fields `color`, `Color`, and `???`.

Terminal 1: run the command of step 2 again. Result: `wishem: link at ws://127.0.0.1:4750/link`. Terminal 2: run the command of step 2 again.

Result:

- After `wishem-godot: connected (link 1)`, the terminal has exactly two lines that start with `WARNING: wishem:`, in this order:
  1. `WARNING: wishem: the sidecar ClearColor.view.json: the label of the field fld_0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d of the component type ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512 gives an empty name. The view does not get the field.`
  2. `WARNING: wishem: the sidecar ClearColor.view.json: the fields fld_694d6cb2-97e8-444e-961e-aa76744837fb and fld_5d6e7f80-9a1b-4c2d-8e3f-4a5b6c7d8e9f of the component type ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512 give the same name "color". The prop has the value of the first field.`
- The shot lines continue in the cycle of colors of step 2: the prop `color` has the value of the first field. Wait five seconds: no new line that starts with `WARNING: wishem:`.

### 6. A new link writes the warnings one more time

Keep terminal 2 running. Press Ctrl+C in terminal 1.

Result: terminal 2 shows `wishem-godot: the hub is not reachable. Godot tries again.` one time, and no line that starts with `WARNING: wishem:`.

Terminal 1: run the command of step 2 again.

Result: terminal 2 shows `wishem-godot: connected (link 2)`, then the two lines of step 5 one more time, in the same order, and then the shot lines in the cycle of colors.

Remove the hand edit. Press Ctrl+C in terminal 2 and in terminal 1. Terminal 3:

```sh
git checkout -- nodejs/wishem/sample-product/model/definitions/ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512.json
```

### 7. The end state

Terminal 3:

```sh
git status --short
docker ps --filter name=wishem-godot --format '{{.Names}}'
```

Result: each command prints nothing. Terminal 1 and terminal 2 show a shell prompt.

### The automated tests of the steps

- Step 1 is the GDScript tests of Tasks 1 to 3.
- Steps 2 to 6 are the second test of `tests/godot.ui.test.ts`, `the Godot application writes the view warnings` (Task 4), with real processes: the sample construct of `startSampleConstruct` with the time paused, the Godot application through `runGodot`, and a link client of the test that sends `time/advance`. The test changes the model with the option `edit` (decision 7), not the files of steps 3 and 5. Its phases:
  1. A model with no definition of the `Color` component type, and no `Color` component (steps 3 and 4): after `connected (link 1)` and the shot of `seq 0`, the lines that start with `WARNING: wishem:` are exactly the line of step 3 with the ID `ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512`. One `time/advance` gives the shot of `seq 1` and no new warning line.
  2. The construct closes. A construct on the same port with the fields `color`, `Color`, and `???` (steps 5 and 6): after `connected (link 2)` and the shot of `seq 0`, the new warning lines are exactly the two lines of step 5, in order, and each pixel of the shot is `#1d4ed8`. One `time/advance` gives the shot of `seq 1`, each pixel `#b91c1c`, and no new warning line.
  3. The construct closes. A construct on the same port with the model of the model folder (step 2): after `connected (link 3)` and the shot of `seq 0`, no new warning line, and each pixel of the shot is `#1d4ed8`.
- Step 7 is the last check of the test: `docker ps -a` shows no container of the run.

## Follow-up

None.
