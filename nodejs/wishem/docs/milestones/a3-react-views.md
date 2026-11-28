# Test guide: milestone A3 "React views"

This guide is the test plan of the milestone A3. It lists each new feature. It shows each feature in steps that one person does alone.

The milestone A3 delivered the React renderer as a package, and the view system of the workbench page. It has these features:

1. The React renderer draws views from a port.
2. The workbench page draws through a link.
3. Inputs from a view: the prop `wishem`.
4. The title of the app bar is a control.
5. The field types `number`, `boolean`, and `reference`.
6. The generated prop types of the views.
7. Nested views.
8. The warnings for bad field names.
9. The tests of the two packages.

## How to read this guide

- The rules of "How to read this guide" in `a1-construct.md` apply here. Read that section first.
- The writer of this guide did each step on the `main` branch. The writer copied the results from the real output.
- The writer did the steps with a browser in a real Chromium: the Playwright image that `workbench-app` uses for `test:ui`, in Docker. A script started the workbench, drove the page, read the text of the page and the console of the browser, and stopped the workbench. A step that a person does with the mouse and the keyboard is written as an action. The script did the same action with the mouse and the keyboard of Playwright.
- The writer used the default ports 4747 and 5173. The writer used the folder `.superpowers/a3-model` of a work tree where this guide has `/tmp/a3-model`. The folder name in a line is the only difference.
- The long `state:` lines of `link-client.mjs` are cut with `...` in this guide.
- "Terminal 1" runs the workbench. "Terminal 2" runs the commands that talk to it. "Terminal 3" runs a listener.
- Run each command from the root of the repository.

## What you need

- The same computer, the same checkout, and the same build as in "What you need" and "Install and build" of `a1-construct.md`.
- For sections 2 to 8: a web browser, and a GNU `sed` (on macOS, write `sed -i ''` and use the GNU `sed` for the `\(` patterns of section 5).
- For section 9: Docker. The tests of the page run a browser in a container.
- The programs in `nodejs/wishem/docs/milestones/a3-react-views/`. They need only the built packages, and the `jsdom` of `workbench-app`. The guide gives the command of each one.

If you did not build the packages yet:

```sh
pnpm install
pnpm build --filter "@thrashplay/wishem-*"
```

The build ends with `Tasks:    16 successful, 16 total`.

### A copy of the model

Each step that changes a model file uses a copy of the model:

```sh
rm -rf /tmp/a3-model
cp -r nodejs/wishem/workbench/model /tmp/a3-model
```

Result: the folder `/tmp/a3-model` has `state.json` and `definitions/ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34.json`.

To put the copy back to the first state, run the two commands again.

### The view files of this guide

Sections 5 to 8 add two views to `nodejs/wishem/workbench-app/src/views/`. Section 5 gives the commands. The files are not in git. At the end of section 8, remove them. The tests of section 9 fail while these files exist.

## 1. The React renderer draws views from a port

`Renderer` of `@thrashplay/wishem-renderer-react` reads the part `store` of a port, and draws one picture for each component that has a view. It uses a direct port of a hub in the same process, or a remote port of a link. Both give the same picture. The program `render-from-port.mjs` draws one view from each port, in a `jsdom` page:

```sh
node nodejs/wishem/docs/milestones/a3-react-views/render-from-port.mjs
```

Result:

```text
direct port: <div data-wishem-entity="e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2" data-wishem-component-type="ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34" style="display: contents;"><h1>Wishem</h1></div>
remote port: <div data-wishem-entity="e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2" data-wishem-component-type="ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34" style="display: contents;"><h1>Wishem</h1></div>
```

What the lines show:

- The two lines are the same. The renderer does not know which kind of port it reads.
- The renderer puts the view in a wrapper `div` with the attributes `data-wishem-entity` and `data-wishem-component-type`. The view does not add them. The wrapper has `display: contents`, so it does not change the layout.
- The program started a construct in its own process, with the model of `nodejs/wishem/workbench/model`. It stopped the construct at the end.

The README of the package has an example with a hub in the page. Run it as a test:

```sh
flock -w 15 /tmp/wishem-heavy.lock timeout 140 pnpm --filter @thrashplay/wishem-renderer-react exec vitest run src/readme-example.test.tsx --coverage.enabled=false --reporter=verbose
```

Result: the line `✓ src/readme-example.test.tsx > runs the example of the README` and `Tests  1 passed (1)`. (The `flock` command exits with code 1 and no output when another job holds the lock. Run the command again.)

## 2. The workbench page draws through a link

The page of the workbench gives the remote port of its link to the renderer. The page shows the same picture as the port of the hub.

Terminal 1:

```sh
pnpm --filter @thrashplay/wishem-workbench-app start --model /tmp/a3-model
```

Result:

```text
$ exec node scripts/start.ts --model /tmp/a3-model
wishem: model /tmp/a3-model
wishem: link at ws://127.0.0.1:4747/link
wishem: workbench at http://127.0.0.1:5173/
```

Terminal 3:

```sh
node nodejs/wishem/docs/milestones/a1-construct/link-client.mjs --url ws://127.0.0.1:5173/link
```

Result: `state: types: AppBar | entities: e_c0d5e6f1 AppBar{title="Wishem"}`.

Open `http://127.0.0.1:5173/` in a web browser.

Result:

- The bar shows `wishem.` (the display typeface shows the title in lowercase, with a full stop).
- The text `WORKBENCH` and the line `Nothing to show yet.` show below the bar.
- The console of the browser has no line that starts with `wishem:`.

Keep the three terminals open for section 4.

## 3. Inputs from a view: the prop `wishem`

Each view gets the reserved prop `wishem`. It has `setField(name, value)` and `submit(input)`. Each call gives an outcome and never throws. `Renderer` takes an optional second port, `input`, that sends the inputs.

The program `view-inputs.mjs` draws a view with a button. The button calls three tools. The program does that with an input port, and then with no input port:

```sh
node nodejs/wishem/docs/milestones/a3-react-views/view-inputs.mjs
```

Result:

```text
--- with an input port
setField title: {"ok":true,"seq":1}
setField nothing: {"ok":false,"reason":"invalid","problems":[{"message":"No field has the prop name \"nothing\""}]}
submit unknown type: {"ok":false,"reason":"unknown-type","problems":[]}
button text: Wishem studio
record: [{"seq":1,"type":"store/set-field","source":"screen-input"}]
--- with no input port
setField title: {"ok":false,"reason":"not-permitted","problems":[]}
setField nothing: {"ok":false,"reason":"invalid","problems":[{"message":"No field has the prop name \"nothing\""}]}
submit unknown type: {"ok":false,"reason":"not-permitted","problems":[]}
button text: Wishem studio
```

What the lines show:

- `setField('title', ...)` sends one `store/set-field` input for the field of the component of the view. The view does not state an ID. The hub accepts it as input 1, from the input subsystem `screen-input`.
- A name that no field has gives the outcome `invalid`. The renderer sends no input.
- An input of a type that the hub does not know gives `unknown-type`.
- With no `input` port, each call that must send gives `not-permitted`, and the record stays empty. The button text in the second part is `Wishem studio` because the hub of this program already holds that title from the first part.

### A view test with no hub

`stubViewTools` gives a `wishem` for a test of a view. It records each call:

```sh
node nodejs/wishem/docs/milestones/a3-react-views/stub-view-tools.mjs
```

Result:

```text
setField: {"ok":true,"seq":1}
submit: {"ok":true,"seq":2}
calls: [{"kind":"setField","name":"title","value":"Wishem studio"},{"kind":"submit","input":{"type":"time/set-running","payload":{"running":false}}}]
refused: {"ok":false,"reason":"not-running","problems":[]}
```

The default outcome is `{ ok: true, seq: <number of the call> }`. The argument of `stubViewTools` can give a different outcome.

## 4. The title of the app bar is a control

The view of the app bar uses `wishem.setField`. The designer changes the title in the page. The page has two subsystems on its link: the output subsystem `page-<hex>` and the input subsystem `page-<hex>-input`. `<hex>` is 16 hexadecimal characters. The page makes it one time for each load.

This section continues from section 2. The three terminals run.

### 4.1 Change the title in the page

In the page, select the title `wishem.` with the mouse.

Result: a text field with the label `Title` opens. It holds `Wishem`. It has the focus, and all its text is selected.

Type `Wishem studio`, and press Enter.

Result:

- The bar shows `wishem studio.`. No text field stays open, and the title button has the focus.
- Terminal 3:

  ```text
  applied #1 store/set-field from page-d8893e308b99194e-input
  state: types: AppBar | entities: e_c0d5e6f1 AppBar{title="Wishem studio"}
  ```

  The 16 characters after `page-` are different for each load of the page. Write down the whole source. It is `S`.

- Terminal 2: `grep -c '"Wishem studio"' /tmp/a3-model/state.json` prints `1`.

### 4.2 A hand edit after an edit in the page

Terminal 2:

```sh
sed -i 's/"Wishem studio"/"Hand edit"/' /tmp/a3-model/state.json
```

Result: the bar shows `hand edit.` with no reload. Terminal 3: `applied #2 store/replace-model from files`.

In the page, select the title, type `Wishem`, and press Enter.

Result: terminal 3 prints `applied #3 store/set-field from S`, and `state.json` holds `"Wishem"`.

### 4.3 A rewind is an undo of the edit in the page

Terminal 2:

```sh
node nodejs/wishem/docs/milestones/a2-time/rewind-client.mjs --seq 2 --url ws://127.0.0.1:5173/link
```

Result:

```text
result: {"ok":true,"seq":4}
title now: "Hand edit"
```

The bar shows `hand edit.`. Terminal 3 prints `applied #4 hub/rewind from rewinder-<number>`. `grep -c '"Hand edit"' /tmp/a3-model/state.json` prints `1`.

### 4.4 An edit while the workbench does not run

Press Ctrl+C in terminal 1.

Result: terminal 3 prints `link closed`. The console of the browser gets the warning `wishem: the hub is not reachable. The page tries again.`

In the page, select the title, type `Offline`, and press Enter.

Result: the field stays open with `Offline`. A line shows below the bar: `The title is not saved. The workbench does not run. Start it, and try again.`

Press Escape.

Result: the field closes, the line goes away, and the bar shows `hand edit.`.

### 4.5 A new link

Run the command of terminal 1 of section 2 again. Run the command of terminal 3 again. Wait for the page.

Result: terminal 3 prints `state: ... AppBar{title="Hand edit"}`. The page reloads by itself, because the Vite server restarted. The writer saw a new `page-<hex>` in the next edit.

In the page, change the title to `Back`. Result: terminal 3 prints `applied #1 store/set-field from page-<16 hex>-input`, and `state.json` holds `"Back"`.

The source of the page is the same for all links of one page load. A restart of the workbench reloads the page, so this guide cannot show that with the workbench. The tests of the client of the hub show it:

```sh
flock -w 15 /tmp/wishem-heavy.lock timeout 140 pnpm --filter @thrashplay/wishem-workbench-app exec vitest run src/hub-client.test.ts -t "the subsystems of the page" --coverage.enabled=false --reporter=verbose
```

Result: `Tests  7 passed | 28 skipped (35)`. One of the seven is `uses the same two IDs after a link ends`.

Press Ctrl+C in terminals 1 and 3.

## 5. The field types `number`, `boolean`, and `reference`

A field has the type `string`, `number`, `boolean`, or `reference`. A reference holds the ID of an entity of the same model. The validation refuses a value of the wrong type, a number that is not finite, and a reference to an entity that does not exist. The store refuses `remove-entity` for an entity that a different entity names.

The program `field-types.mjs` validates a model and sends inputs to a store:

```sh
node nodejs/wishem/docs/milestones/a3-react-views/field-types.mjs
```

Result (the lines of the problems and the outcomes are cut at 150 characters with `...`):

```text
valid model: true
problem: Entity e_b2c3d4e5-... has the value "many" for the field "Points" of "Task", but the type of the field is "number"
problem: Entity e_a1b2c3d4-... has the field "First" of "List", which refers to the entity "e_00000000-0000-4000-8000-000000000000", and no entity has that ID
points 5: {"ok":true,"seq":1}
points "5": {"ok":false,"reason":"invalid","problems":[{"message":"Entity e_b2c3d4e5-... has the value \"5\" for the field \"Points\" of \"Task\", but the type of the field is \"number\"", ...
points NaN: {"ok":false,"reason":"invalid","problems":[{"message":"Entity e_b2c3d4e5-... has the value null for the field \"Points\" of \"Task\", but the type of the field is \"number\"", ...
done true: {"ok":true,"seq":2}
done "true": {"ok":false,"reason":"invalid","problems":[{"message":"Entity e_b2c3d4e5-... has the value \"true\" for the field \"Done\" of \"Task\", but the type of the field is \"boolean\"", ...
first = nothing: {"ok":false,"reason":"invalid","problems":[{"message":"Entity e_a1b2c3d4-... has the field \"First\" of \"List\", which refers to the entity \"e_00000000-0000-4000-8000-000000000000\", and no entity has that ID", ...
remove the held task: {"ok":false,"reason":"invalid","problems":[{"message":"Entity e_a1b2c3d4-... has the field \"First\" of \"List\", which refers to the entity \"e_b2c3d4e5-...\", and no entity has that ID", ...
remove the list: {"ok":true,"seq":3}
then remove the task: {"ok":true,"seq":4}
```

What the lines show:

- A number and a boolean are accepted. A text in a number field or in a boolean field is refused.
- The value `NaN` is refused. The message names the value `null`, because the check reads the value after it was changed to JSON.
- A reference to an entity that does not exist is refused, in a model and in `set-field`.
- `remove-entity` for the task that the list names is refused. The message says that the list refers to an entity that no entity has. After the list is removed, the task can be removed.

### The model for sections 6, 7, and 8

The next three sections use one model and two views. Make them now. Terminal 2:

```sh
cat > /tmp/a3-model/definitions/ct_7d1e2f30-4a5b-4c6d-8e9f-0a1b2c3d4e5f.json <<'EOF'
{ "id": "ct_7d1e2f30-4a5b-4c6d-8e9f-0a1b2c3d4e5f", "label": "List", "fields": [
  { "id": "fld_1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", "label": "Heading", "type": "string" },
  { "id": "fld_2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e", "label": "First", "type": "reference" },
  { "id": "fld_3c4d5e6f-7a8b-4c9d-8e0f-2a3b4c5d6e7f", "label": "Second", "type": "reference" } ] }
EOF
cat > /tmp/a3-model/definitions/ct_8e2f3a41-5b6c-4d7e-9f80-1b2c3d4e5f60.json <<'EOF'
{ "id": "ct_8e2f3a41-5b6c-4d7e-9f80-1b2c3d4e5f60", "label": "Task", "fields": [
  { "id": "fld_4d5e6f7a-8b9c-4d0e-9f1a-3b4c5d6e7f80", "label": "Title", "type": "string" },
  { "id": "fld_5e6f7a8b-9c0d-4e1f-8a2b-4c5d6e7f8091", "label": "Done", "type": "boolean" },
  { "id": "fld_6f7a8b9c-0d1e-4f2a-9b3c-5d6e7f809102", "label": "Points", "type": "number" } ] }
EOF
cat > /tmp/a3-model/state.json <<'EOF'
{ "entities": [
  { "id": "e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2", "components": { "ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34": { "fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62": "Wishem" } } },
  { "id": "e_a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", "components": { "ct_7d1e2f30-4a5b-4c6d-8e9f-0a1b2c3d4e5f": {
    "fld_1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d": "Today",
    "fld_2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e": "e_b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
    "fld_3c4d5e6f-7a8b-4c9d-8e0f-2a3b4c5d6e7f": "e_c3d4e5f6-a7b8-4c9d-8e0f-2a3b4c5d6e7f" } } },
  { "id": "e_b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e", "components": { "ct_8e2f3a41-5b6c-4d7e-9f80-1b2c3d4e5f60": {
    "fld_4d5e6f7a-8b9c-4d0e-9f1a-3b4c5d6e7f80": "Draw the goat", "fld_5e6f7a8b-9c0d-4e1f-8a2b-4c5d6e7f8091": false, "fld_6f7a8b9c-0d1e-4f2a-9b3c-5d6e7f809102": 3 } } },
  { "id": "e_c3d4e5f6-a7b8-4c9d-8e0f-2a3b4c5d6e7f", "components": { "ct_8e2f3a41-5b6c-4d7e-9f80-1b2c3d4e5f60": {
    "fld_4d5e6f7a-8b9c-4d0e-9f1a-3b4c5d6e7f80": "Name the goat", "fld_5e6f7a8b-9c0d-4e1f-8a2b-4c5d6e7f8091": true, "fld_6f7a8b9c-0d1e-4f2a-9b3c-5d6e7f809102": 1 } } } ] }
EOF
V=nodejs/wishem/workbench-app/src/views
echo '{ "kind": "react", "componentType": "ct_7d1e2f30-4a5b-4c6d-8e9f-0a1b2c3d4e5f" }' > $V/List.view.json
echo '{ "kind": "react", "componentType": "ct_8e2f3a41-5b6c-4d7e-9f80-1b2c3d4e5f60" }' > $V/Task.view.json
cat > $V/List.tsx <<'EOF'
import type { Props } from './List.view.gen.js'

const ListView = ({ heading, first, second }: Props) => (
  <section aria-label={heading ?? ''} className='p-4'>
    <h2>{heading}</h2>
    {first}
    {second}
  </section>
)

export default ListView
EOF
cat > $V/Task.tsx <<'EOF'
import type { Props } from './Task.view.gen.js'

const TaskView = ({ title, done, points, wishem }: Props) => (
  <label className='flex gap-2'>
    <input
      type='checkbox'
      checked={done ?? false}
      onChange={(event) => {
        void wishem.setField('done', event.currentTarget.checked)
      }}
    />
    {title} ({points ?? 0} points)
  </label>
)

export default TaskView
EOF
```

Then, in terminal 1, start the workbench with this model, and in terminal 3 start the listener (the commands of section 2). Wait 1 second between them, so that the generator writes its files first.

## 6. The generated prop types of the views

The generator writes `<name>.view.gen.ts` next to each sidecar. The workbench runs it at the start, and after each change to a definition or a sidecar. The file exports the type `Values` (what `wishem.setField` takes) and the type `Props` (the props, and the member `wishem`).

Result in terminal 1, after the start:

```text
wishem: wrote List.view.gen.ts: added heading, first, second
wishem: wrote Task.view.gen.ts: added title, done, points
```

Terminal 2:

```sh
grep -E "readonly (first|done|points):" nodejs/wishem/workbench-app/src/views/*.view.gen.ts
```

Result (the lines start with the path of the file; the path is cut here):

```text
.../List.view.gen.ts:  readonly first: string
.../List.view.gen.ts:  readonly first: ReactNode
.../Task.view.gen.ts:  readonly done: boolean
.../Task.view.gen.ts:  readonly points: number
.../Task.view.gen.ts:  readonly done: boolean | undefined
.../Task.view.gen.ts:  readonly points: number | undefined
```

What the lines show:

- The first line of each pair is in `Values`: a number is `number`, a boolean is `boolean`, and a reference is the ID, `string`.
- The second line of each pair is in `Props`: the same types, with `undefined` when the component omits the field. A reference is `ReactNode`, because the prop is the picture of the entity.

### The command of the package

Run the generator for the base workbench, with no change to a file:

```sh
pnpm --filter @thrashplay/wishem-workbench-app generate --check
```

Result:

```text
$ node scripts/generate.ts --check
wishem: model .../nodejs/wishem/workbench/model
wishem: the generated files of 1 view are current
```

The exit code is 0. The option `--model` and the option `--views` give other folders. The writer ran the command on a copy of the model and a copy of the sidecar, with no generated file:

```sh
cp -r nodejs/wishem/workbench/model /tmp/a3-model-base
mkdir -p /tmp/a3-views
cp nodejs/wishem/workbench-app/src/views/AppBar.view.json /tmp/a3-views/
pnpm --filter @thrashplay/wishem-workbench-app generate --check --model /tmp/a3-model-base --views /tmp/a3-views
pnpm --filter @thrashplay/wishem-workbench-app generate --model /tmp/a3-model-base --views /tmp/a3-views
```

Result of the first `generate` command, with `--check`: the exit code is 1.

```text
wishem: model /tmp/a3-model-base
wishem: AppBar.view.gen.ts is not current: added title
wishem: run the generate script, then correct each view that the type check names
```

Result of the second `generate` command: `wishem: wrote AppBar.view.gen.ts: added title`. The exit code is 0.

### The generator as a library

The program `names-and-types.mjs` calls the library entry `@thrashplay/wishem-renderer-react/view-types`. It also shows the names of props (section 8):

```sh
rm -rf /tmp/a3-gen-views
node nodejs/wishem/docs/milestones/a3-react-views/names-and-types.mjs /tmp/a3-gen-views
```

Result, from the line `--- the generator`:

```text
--- the generator
wishem: wrote List.view.gen.ts: added heading, first
wishem: wrote Task.view.gen.ts: added title, done, points
--- List.view.gen.ts
// Generated from List.view.json and the definition of its component type. Do not edit.
// To write this file again: node names-and-types.mjs <folder>

import type { ViewTools } from '@thrashplay/wishem-renderer-react'
import type { ReactNode } from 'react'

/** The values that `wishem.setField` takes for the component type "List" (ct_7d1e2f30-...). */
export interface Values {
  /** The field "Heading" (fld_1a2b3c4d-...). */
  readonly heading: string
  /** The field "First" (fld_2b3c4d5e-...). */
  readonly first: string
}

/** The fields of the component type "List" (ct_7d1e2f30-...). */
export interface Props {
  /** The field "Heading" (fld_1a2b3c4d-...). */
  readonly heading: string | undefined
  /** The picture of the entity that the field "First" (fld_2b3c4d5e-...) names. */
  readonly first: ReactNode
  /** Sends inputs for this component. */
  readonly wishem: ViewTools<Values>
}
```

The header of the file names the command that the caller gave in the option `command`. The cut `...` replaces the rest of each ID.

## 7. Nested views

The prop of a `reference` field is the picture of the entity that the field names. An entity that a field of a drawn component names is drawn only where its holder puts it.

This section uses the workbench of section 6. In the browser, open `http://127.0.0.1:5173/` and reload it.

Result:

- The page text is `wishem.`, `Today`, `Draw the goat (3 points)`, `Name the goat (1 points)`, then `WORKBENCH` and `Nothing to show yet.`.
- The two tasks are inside the heading `Today`. They do not show again below the list.

In the developer tools of the browser, run:

```js
document.querySelectorAll('[data-wishem-entity="e_b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e"]').length
```

Result: `1`. The wrapper of that entity is inside the wrapper with `data-wishem-entity="e_a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"` (the list). The writer read the wrappers of the page in order. The app bar and the list are at the top level. The two tasks are nested.

### 7.1 A boolean through the page

Select the checkbox of `Draw the goat`.

Result: the checkbox is set. Terminal 3 prints `applied #1 store/set-field from page-<16 hex>-input`, and `Done=true` for the task `Draw the goat`. Terminal 2:

```sh
grep -o '"fld_5e6f7a8b-9c0d-4e1f-8a2b-4c5d6e7f8091": *[a-z]*' /tmp/a3-model/state.json
```

Result: two lines. Both end with `true`.

### 7.2 A value of the wrong type in a hand edit

Terminal 2:

```sh
sed -i 's/"fld_6f7a8b9c-0d1e-4f2a-9b3c-5d6e7f809102": *3/"fld_6f7a8b9c-0d1e-4f2a-9b3c-5d6e7f809102": "many"/' /tmp/a3-model/state.json
```

Result: terminal 1 prints these lines. The page does not change, and still shows `Draw the goat (3 points)`:

```text
wishem: problem in state.json: Entity e_b2c3d4e5-... has the value "many" for the field "Points" of "Task", but the type of the field is "number"
wishem: the last correct model stays
```

Terminal 2:

```sh
sed -i 's/"fld_6f7a8b9c-0d1e-4f2a-9b3c-5d6e7f809102": *"many"/"fld_6f7a8b9c-0d1e-4f2a-9b3c-5d6e7f809102": 4/' /tmp/a3-model/state.json
```

Result: terminal 1 prints `wishem: the model is correct: 3 component types, 4 entities`. Terminal 3 prints `applied #2 store/replace-model from files`. The page shows `Draw the goat (4 points)`.

### 7.3 A reference to an entity that does not exist

Terminal 2:

```sh
sed -i 's/\("fld_3c4d5e6f-7a8b-4c9d-8e0f-2a3b4c5d6e7f": "\)e_c3d4e5f6-a7b8-4c9d-8e0f-2a3b4c5d6e7f/\1e_00000000-0000-4000-8000-000000000000/' /tmp/a3-model/state.json
```

Result: terminal 1 prints these lines. The page does not change.

```text
wishem: problem in state.json: Entity e_a1b2c3d4-... has the field "Second" of "List", which refers to the entity "e_00000000-0000-4000-8000-000000000000", and no entity has that ID
wishem: the last correct model stays
```

Put the first value back:

```sh
sed -i 's/\("fld_3c4d5e6f-7a8b-4c9d-8e0f-2a3b4c5d6e7f": "\)e_00000000-0000-4000-8000-000000000000/\1e_c3d4e5f6-a7b8-4c9d-8e0f-2a3b4c5d6e7f/' /tmp/a3-model/state.json
```

Result: terminal 1 prints `wishem: the model is correct: 3 component types, 4 entities`.

### 7.4 A cycle of references

Terminal 2 (the list names itself in `First`):

```sh
sed -i 's/"fld_2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e": "e_b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e"/"fld_2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e": "e_a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"/' /tmp/a3-model/state.json
```

Result:

- Terminal 3: `applied #3 store/replace-model from files`.
- The console of the browser has one warning, and terminal 1 shows the same text:

  ```text
  wishem: the sidecar List.view.json: the field fld_2b3c4d5e-... of the component type ct_7d1e2f30-... of the entity e_a1b2c3d4-... names the entity e_a1b2c3d4-..., which is already on the path of its picture. The view gets no picture for it.
  ```

- The page shows the list one time. The prop `first` has no picture. The task `Draw the goat` is no longer held, so the page draws it at the top level, after the list: the text is `wishem.`, `Today`, `Name the goat (1 points)`, `Draw the goat (4 points)`.

Put the reference back:

```sh
sed -i 's/"fld_2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e": "e_a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"/"fld_2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e": "e_b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e"/' /tmp/a3-model/state.json
```

Result: terminal 3 prints `applied #4 store/replace-model from files`. The page shows `Today`, `Draw the goat (4 points)`, `Name the goat (1 points)` again.

## 8. The warnings for bad field names

A view gets one prop for each field. The name of the prop comes from the label: the words are cut at each run of characters that are not ASCII letters or digits. The first word starts in lower case, and each other word starts in upper case. These labels give a problem: an empty name (`???`), a reserved name (`wishem` and `key`), a name that starts with a digit, and the same name as another field. A field with an empty name or a reserved name gives no prop. The renderer writes a warning to the console of the browser for an empty name, a reserved name, and the same name. The generator writes an error, and it keeps the old generated file.

### 8.1 In a program

```sh
node nodejs/wishem/docs/milestones/a3-react-views/names-and-types.mjs /tmp/a3-gen-views
```

Result, the lines before `--- the generator` (the IDs are cut with `...`):

```text
label "Max health" gives the name "maxHealth"
label "title" gives the name "title"
label "???" gives the name ""
label "2nd try" gives the name "2ndTry"
label "wishem" gives the name "wishem"
--- the props of the type Bad
["maxHealth"]
["same-name","reserved-name","empty-name"]
--- the warnings of the renderer
wishem: the sidecar Bad.view.json: the label of the field fld_a1000000-...04 of the component type ct_9f3a4b52-... gives an empty name. The view does not get the field.
wishem: the sidecar Bad.view.json: the fields fld_a1000000-...01 and fld_a1000000-...02 of the component type ct_9f3a4b52-... give the same name "maxHealth". The prop has the value of the first field.
wishem: the sidecar Bad.view.json: the label of the field fld_a1000000-...03 of the component type ct_9f3a4b52-... gives the reserved name "wishem". The view does not get the field.
```

Result of the last part, after the line `--- the generator again, and a sidecar for the type Bad`:

```text
wishem: error: Bad.view.json: the fields fld_a1000000-...01 and fld_a1000000-...02 of the component type ct_9f3a4b52-... give the same name "maxHealth"
wishem: error: Bad.view.json: the label of the field fld_a1000000-...03 of the component type ct_9f3a4b52-... gives the reserved name "wishem"
wishem: error: Bad.view.json: the label of the field fld_a1000000-...04 of the component type ct_9f3a4b52-... gives an empty name
```

The generator wrote no file for `Bad.view.json`. The renderer only warns about the same name, and the generator refuses it.

### 8.2 In the workbench page

The workbench of section 6 runs. Terminal 2 gives the `Task` definition a field with the label `???`:

```sh
cat > /tmp/a3-model/definitions/ct_8e2f3a41-5b6c-4d7e-9f80-1b2c3d4e5f60.json <<'EOF'
{ "id": "ct_8e2f3a41-5b6c-4d7e-9f80-1b2c3d4e5f60", "label": "Task", "fields": [
  { "id": "fld_4d5e6f7a-8b9c-4d0e-9f1a-3b4c5d6e7f80", "label": "Title", "type": "string" },
  { "id": "fld_5e6f7a8b-9c0d-4e1f-8a2b-4c5d6e7f8091", "label": "Done", "type": "boolean" },
  { "id": "fld_6f7a8b9c-0d1e-4f2a-9b3c-5d6e7f809102", "label": "Points", "type": "number" },
  { "id": "fld_7a8b9c0d-1e2f-4a3b-8c4d-6e7f80910213", "label": "???", "type": "string" } ] }
EOF
md5sum nodejs/wishem/workbench-app/src/views/Task.view.gen.ts
```

Result:

- Terminal 1: `wishem: error: Task.view.json: the label of the field fld_7a8b9c0d-1e2f-4a3b-8c4d-6e7f80910213 of the component type ct_8e2f3a41-5b6c-4d7e-9f80-1b2c3d4e5f60 gives an empty name`.
- The console of the browser has one warning: `wishem: the sidecar Task.view.json: the label of the field fld_7a8b9c0d-... of the component type ct_8e2f3a41-... gives an empty name. The view does not get the field.`
- The page does not change. The generated file does not change: compare the `md5sum` with the value from before the edit (run the command before the edit too).

Next, a reserved name and the same name:

```sh
cat > /tmp/a3-model/definitions/ct_8e2f3a41-5b6c-4d7e-9f80-1b2c3d4e5f60.json <<'EOF'
{ "id": "ct_8e2f3a41-5b6c-4d7e-9f80-1b2c3d4e5f60", "label": "Task", "fields": [
  { "id": "fld_4d5e6f7a-8b9c-4d0e-9f1a-3b4c5d6e7f80", "label": "Title", "type": "string" },
  { "id": "fld_5e6f7a8b-9c0d-4e1f-8a2b-4c5d6e7f8091", "label": "Done", "type": "boolean" },
  { "id": "fld_6f7a8b9c-0d1e-4f2a-9b3c-5d6e7f809102", "label": "Points", "type": "number" },
  { "id": "fld_7a8b9c0d-1e2f-4a3b-8c4d-6e7f80910213", "label": "wishem", "type": "string" },
  { "id": "fld_8b9c0d1e-2f3a-4b4c-9d5e-7f8091021324", "label": "points", "type": "number" } ] }
EOF
```

Result:

- Terminal 1 prints two errors:

  ```text
  wishem: error: Task.view.json: the label of the field fld_7a8b9c0d-... of the component type ct_8e2f3a41-... gives the reserved name "wishem"
  wishem: error: Task.view.json: the fields fld_6f7a8b9c-... and fld_8b9c0d1e-... of the component type ct_8e2f3a41-... give the same name "points"
  ```

- The console of the browser has two warnings. The first is `... give the same name "points". The prop has the value of the first field.` The second is `... gives the reserved name "wishem". The view does not get the field.`
- The page does not change. The generated file does not change (the same `md5sum`).

Put the definition back (the first `cat` of "The model for sections 6, 7, and 8", for the file `ct_8e2f3a41-...json`). Result: terminal 1 prints no error line. The `md5sum` is the same.

### 8.3 The command of the package

For the empty name, the `generate` command of the package stops with exit code 1. The writer used the copy `/tmp/a3-model-base` and the folder `/tmp/a3-views` of section 6, which has `AppBar.view.json` and a current `AppBar.view.gen.ts`. First, the label of the field must be `???`:

```sh
sed -i 's/"label": "title"/"label": "???"/' /tmp/a3-model-base/definitions/ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34.json
```

Then:

```sh
pnpm --filter @thrashplay/wishem-workbench-app generate --model /tmp/a3-model-base --views /tmp/a3-views
```

Result:

```text
$ node scripts/generate.ts --model /tmp/a3-model-base --views /tmp/a3-views
wishem: model /tmp/a3-model-base
wishem: error: AppBar.view.json: the label of the field fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62 of the component type ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34 gives an empty name
```

The exit code is 1, and the old `AppBar.view.gen.ts` stays.

### Clean up

Press Ctrl+C in terminals 1 and 3. Remove the view files of this guide:

```sh
rm -f nodejs/wishem/workbench-app/src/views/List.tsx nodejs/wishem/workbench-app/src/views/List.view.gen.ts nodejs/wishem/workbench-app/src/views/List.view.json
rm -f nodejs/wishem/workbench-app/src/views/Task.tsx nodejs/wishem/workbench-app/src/views/Task.view.gen.ts nodejs/wishem/workbench-app/src/views/Task.view.json
git status --short
```

Result: `git status --short` prints no line for `nodejs/wishem/workbench-app/src/views/`.

## 9. The tests of the two packages

The milestone also made the tests of `renderer-react` and `workbench-app` prove their claims. These tests have no new behavior for a person to see, and the commands below show that they pass.

```sh
flock -w 15 /tmp/wishem-heavy.lock timeout 140 pnpm --filter @thrashplay/wishem-renderer-react exec vitest run --coverage.enabled=false
```

Result: `Test Files  11 passed (11)` and `Tests  213 passed (213)`.

The tests of the page run a Chromium in Docker. The section 8 clean up must be done before them.

```sh
flock -w 15 /tmp/wishem-heavy.lock timeout 140 pnpm --filter @thrashplay/wishem-workbench-app test:ui
```

Result: the last line is `60 passed (22.0s)`. 40 tests are in the project `style-guide` (the screenshot and the accessibility test of each section, and the states of the app bar: the title, a long title, the open field, `SAVING`, and the line `The title is not saved.`, each one in light and in dark mode). 20 tests are in the project `workbench`. They include `a change of the title in the page`, `is followed by a hand edit`, and `is undone by a rewind through a client of the link`. The time depends on your computer.

To see the style guide in a browser instead, run `pnpm --filter @thrashplay/wishem-workbench-app style-guide`. The writer did not run this command, because it opens a browser on the computer. The tests above use the same components.

## What the milestone did not build

- A panel that lists the entities of a product, and a form to change a field value (the workbench tool, issue #537).
- A list of references, a field that a person can clear, and an input that removes a field value.
- A control for undo in the page. A rewind is an input that a client of the link sends (section 4.3). A rule for which subsystem can send `hub/rewind` is not built (issue #582).
- A view that reads a part other than `store`.
- A way to see in the workbench that the source of the page stays the same for a new link. A restart of the workbench reloads the page (section 4.5). Only the tests show it.
- The same warnings in the PixiJS renderer and in the Godot renderer. The PixiJS renderer gives the prop `""` for a field with an empty name, and no warning. The Godot renderer gives no warning for an empty name, a reserved name, or the same name (issue #542).
- A name that starts with a digit gives a generator error, but the renderer gives no warning for it.
- A warning in the page for a view whose sidecar is not valid JSON. Vite stops the page with its own error, and the generator names the file in terminal 1.
- A build that a person can install. The packages are private.
