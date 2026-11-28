# Test guide: milestone A4 "Workbench and product"

This guide is the test plan of the milestone A4. It lists each new feature. It shows each feature in steps that one person does alone.

The milestone A4 delivered the sample product and a workbench that mounts a product, lists its things, changes them, and runs it. It has these features:

1. Mount the sample product in the workbench.
2. List the things of the product and change one.
3. Run, pause, step, step back, and stop a product construct.
4. A product construct in a child process.
5. The `wishem` command with `--product` and `--product-code`.
6. A list of references.
7. Clear a field.
8. Live values stay when an entity is added or removed.
9. A warning that names its definition file.
10. Features for a program: the update subsystem, the store, and `productChanges`.

## How to read this guide

- A step has a command or an action. After it, the guide gives the result that you see.
- The writer of this guide did each step on the branch `worktree-a4-close-out` (at `main` commit `29d2f443`) with real processes. The writer copied the results from the real output.
- The writer cannot open a web browser. A script did each step of a page in the pinned Chromium of the package `workbench-app` (a Playwright image, in Docker). The script is `nodejs/wishem/docs/milestones/a4-workbench/page-driver.mjs`. It clicks and types in the page, and prints the state of the page as text. The steps below give the text that it prints. A person does the same actions with the mouse and the keyboard, and sees the same values.
- The writer used the default ports: 5173 (the page) and 4747 (the link). A product construct uses a port that the system selects. The port numbers in these lines differ on each run.
- A line that starts with `...` in a result means that the line continues. The guide cuts a long line.
- "Terminal 1" runs a long process. "Terminal 2" runs the other commands.
- Run each command from the root of the repository, unless the guide says other.
- A copy of a model folder keeps the files of the repository unchanged. The workbench writes `state.json` of the product folder at each change. Do each step with a copy.

## What you need

- A Linux or macOS computer with Node.js 24 and pnpm 11. The file `.nvmrc` of the repository gives the version of Node.js.
- A new checkout of the repository.
- A web browser, for the actions on the page.
- Docker, local or remote through `DOCKER_HOST`, only for the script `page-driver.mjs`. A person with a web browser does not need it.
- A GNU `sed`. On macOS, write `sed -i ''` in place of `sed -i`.

### Install and build

```sh
pnpm install
pnpm build --filter "@thrashplay/wishem-*"
```

Result: the build ends with `Tasks:    19 successful, 19 total`. It took 15 seconds for the writer. A build with an empty cache can take longer.

### The copies

```sh
rm -rf /tmp/a4-product /tmp/a4-model
cp -r nodejs/wishem/sample-product/model /tmp/a4-product
cp -r nodejs/wishem/workbench/model /tmp/a4-model
```

Result: `/tmp/a4-product` has `state.json` and `definitions/` with two files. `/tmp/a4-model` is the model folder of the base workbench. To put the copies back, run the three commands again.

### The script of the page

Terminal 2, from the folder `nodejs/wishem/workbench-app`, with the workbench running (section 1). In this guide, `STEPS` stands for the steps that a section gives:

```sh
cd nodejs/wishem/workbench-app
node scripts/browser-server.ts node ../docs/milestones/a4-workbench/page-driver.mjs STEPS
```

The script prints `step <n> <step>: done` for each step and then the state of the page. The first lines of its output are build lines of the package. A step that fails prints `error: step <n> ...` and the exit code is 1. The header of `page-driver.mjs` lists all steps. The script opens a new page for each call, so it starts with no selection. A product construct that runs keeps running between two calls.

## 1. Mount the sample product in the workbench

Terminal 1:

```sh
pnpm --filter @thrashplay/wishem-workbench-app start --product /tmp/a4-product --product-code @thrashplay/wishem-sample-product --product-views nodejs/wishem/sample-product/views/react
```

Result:

```text
$ exec node scripts/start.ts --product /tmp/a4-product --product-code @thrashplay/wishem-sample-product --product-views nodejs/wishem/sample-product/views/react
wishem: model /.../nodejs/wishem/workbench/model
wishem: product /tmp/a4-product
wishem: product code @thrashplay/wishem-sample-product
wishem: product views /.../nodejs/wishem/sample-product/views/react
wishem: link at ws://127.0.0.1:4747/link
wishem: workbench at http://127.0.0.1:5173/
```

Open `http://127.0.0.1:5173/`. Result: the page has the list of the things of the product with two items, `Counter, Color` and the short ID `e_99969ed3`. The inspector says "Select an entity to change it." The run area at the right says "Not running" and has the button Run. The stage says "Not running. Press Run to start the product."

Script, terminal 2: `print`. Result:

```text
entities: Counter, Color e_99969ed3
inspector: Select an entity to change it.
run: Not running tick - - [run]
stage: ; Not running. Press Run to start the product.
```

The picture `nodejs/wishem/docs/milestones/a4-workbench/workbench.png` shows the page with a paused product and a selected entity.

Keep the workbench running for sections 2, 3, 4, 7, and 8.

## 2. List the things of the product and change one

1. Terminal 2, script: `select:e_99969ed3 type:Counter.count=7`.

   Result: the list marks the item as selected. The inspector has the group `Counter` with the field `count` and the group `Color` with the field `color`:

   ```text
   entities: Counter, Color e_99969ed3 [selected]
   Counter.count = 7
   Color.color = #1d4ed8
   ```

   The file `/tmp/a4-product/state.json` now has `"fld_ef085a2e-22ef-4409-bac4-9cd5648d0705": 7`. The row shows no "saving" mark after the change.

2. A text that is not a number. Script: `select:e_99969ed3 type:Counter.count=abc`.

   Result:

   ```text
   Counter.count = abc
   alert: The value is not saved. Type a number.
   ```

   The file does not change.

3. Escape restores the value. Script: `select:e_99969ed3 typeonly:Counter.count=12 escape:Counter.count`.

   Result: `Counter.count = 0` (the value of the part).

4. A hand edit shows with no reload. Script (the step `exec` runs the command in the root of the repository):

   ```text
   select:e_99969ed3 "exec:sed -i 's/\"fld_ef085a2e-22ef-4409-bac4-9cd5648d0705\": 7/\"fld_ef085a2e-22ef-4409-bac4-9cd5648d0705\": 100/' /tmp/a4-product/state.json" wait:800
   ```

   Result: `Counter.count = 100`. A person does the same with a text editor on `/tmp/a4-product/state.json` while the page is open.

5. The same, while a product construct runs: see section 8.

## 3. Run, pause, step, step back, and stop a product construct

Each control sends an input to the workbench. The status, the tick, and the time show in the run area. The stage draws the color and the count of the running product. Script calls, terminal 2:

1. `run waitfor:Running wait:600 pause`.

   Result:

   ```text
   run: Paused tick 12 0.60 s [stop resume step back]
   stage: Color #1d4ed8; Count 19
   ```

   The count is the first count (7) plus the number of ticks (12). The tick number you see depends on the time between the steps. The time is the tick times 0.05 s. The terminal 1 prints `wishem: construct play runs in the process <pid>` and `wishem: construct play runs, link at ws://127.0.0.1:<port>/link`.

2. `step step`. Result: the tick is 14, the time is 0.70 s, and the stage says `Color #15803d; Count 21`.
3. `back`. Result: `run: Paused tick 13 0.65 s [stop resume step back]` and `stage: Color #b91c1c; Count 20`.
4. `resume wait:600 pause`. Result: the status goes to Running and back to Paused. The tick is higher than 13 (the writer got 25), and the count is the first count plus the tick (32).
5. `stop`. Result: `run: Stopped tick - - [run]` and `stage: ; Not running. Press Run to start the product.` Terminal 1 prints `wishem: construct play stopped`.
6. `run`. Result: `run: Starting tick - - [stop]` and the stage says "Connecting to the product." Then the product construct runs from tick 0, with the count of the file. Terminal 1 prints a new process ID and a new link port.
7. After step 5, the list of the enabled controls has only `run`.

The tick, the count, and the color depend on the ticks, so a step after a step back gives the same values again (tick 14 gives `#15803d` and the next count).

## 4. A product construct in a child process

With a product construct running (section 3, step 6), Terminal 2:

```sh
ps -eo pid,ppid,args | grep -E "product-construct-process|scripts/start.ts" | grep -v grep
```

Result: two processes. The process `node scripts/start.ts ...` is the parent. The process `.../construct-manager/dist/product-construct-process.js` has the parent PID of the first. The ID of the child is the number in the terminal 1 line `wishem: construct play runs in the process <pid>`.

1. A fault of the child. Run `kill -9 <pid of the child>`.

   Result: terminal 1 prints `wishem: construct play failed: The process of the construct ended with the signal SIGKILL.` in less than 2 seconds. The page shows the status Failed, the alert "The process of the construct ended with the signal SIGKILL.", and the button Run. The stage is back to its zero state.

2. Script: `run waitfor:Running pause`. Result: `run: Paused tick 1 0.05 s [stop resume step back]`. The control Run stops the failed construct and starts a new one, with a new process ID (the writer saw 2002912 in place of 2000372).
3. Press Ctrl+C in terminal 1 (stop the workbench). Result: the line `wishem: construct play stopped` and no child process stays. `ps` shows no `product-construct-process.js` of your run.

A stop and a start in one pass (the two inputs in one turn) also give a new process: see section 5, step 4.

## 5. The `wishem` command with `--product` and `--product-code`

Stop the workbench first (Ctrl+C in terminal 1). Both programs use the port 4747. Terminal 1:

```sh
pnpm --filter @thrashplay/wishem-workbench exec wishem start /tmp/a4-model --product /tmp/a4-product --product-code @thrashplay/wishem-sample-product
```

Result:

```text
wishem: model /tmp/a4-model
wishem: product /tmp/a4-product
wishem: product code @thrashplay/wishem-sample-product
wishem: 1 component type, 1 entity
wishem: product: 2 component types, 1 entity
wishem: link at ws://127.0.0.1:4747/link
```

The command `pnpm exec` starts the command in the folder `nodejs/wishem/workbench`. Give an absolute path for each folder and module, as these lines do.

1. Start a product construct. Terminal 2:

   ```sh
   RAW=nodejs/wishem/docs/milestones/a1-construct/raw-link.mjs
   node $RAW --once --send '{"type":"constructs/start","payload":{"construct":"play"}}' | grep '"result"'
   ```

   Result: `received: {"t":"result","request":1,"result":{"ok":true,"seq":1}}`. Terminal 1 prints `wishem: construct play runs in the process <pid>` and `wishem: construct play runs, link at ws://127.0.0.1:<port>/link`.

2. Read the product construct. Terminal 2:

   ```sh
   PLAY=ws://127.0.0.1:<port>/link   # the address that terminal 1 printed
   node $RAW --url $PLAY --once | grep -o '"time":{[^}]*}'
   ```

   Result: `"time":{"now":4350,"ticks":87,"running":true,"stepMs":50}`. The ticks grow while it runs. In the welcome message, the count of the sample entity equals the ticks (87 in the writer run).

3. Pause. Terminal 2:

   ```sh
   node $RAW --once --send "{\"type\":\"constructs/send\",\"payload\":{\"construct\":\"play\",\"input\":{\"type\":\"time/set-running\",\"payload\":{\"running\":false}}}}" | grep '"result"'
   ```

   Result: `"ok":true`. Read the product construct twice (step 2), one second apart. Both lines show `"running":false` and the same ticks (19 in the writer run).

4. A stop and a start in one pass:

   ```sh
   node $RAW --once --send '{"type":"constructs/stop","payload":{"construct":"play"}}' --send '{"type":"constructs/start","payload":{"construct":"play","running":false}}' | grep '"result"'
   ```

   Result: two lines with `"ok":true` (`seq` 3 and 4 in the writer run). Terminal 1 prints `wishem: construct play stopped`, then a new process ID and a new link address. The new product construct has `"time":{"now":0,"ticks":0,"running":false,"stepMs":50}`.

5. Stop the command with Ctrl+C in terminal 1. Result: the last line is `wishem: construct play stopped`. The port 4747 is free, and no child process stays.

6. Option `--port`. Run the command with `--port 4748`. Result: the last line is `wishem: link at ws://127.0.0.1:4748/link`. Stop it with Ctrl+C.

7. Faults of the options. Each command prints its reason and starts no server:

   | Command                                                                                           | Result                                                                                                                                     |
   | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
   | `wishem start /tmp/a4-model --product-code @thrashplay/wishem-sample-product` (no `--product`)    | `wishem: --product-code needs --product`, the usage line, exit code 2                                                                      |
   | `wishem start`                                                                                    | The usage line, exit code 2                                                                                                                |
   | `... --product /tmp/a4-product --product-code ./nope.mjs`                                         | `wishem: the product code ./nope.mjs cannot be loaded: Cannot find module '...nodejs/wishem/workbench/nope.mjs' imported from ...`, exit 1 |
   | a module `/tmp/a4-bad.mjs` with the text `export const behaviors = 5`, and `--product-code` of it | `wishem: the product code has no correct list behaviors: The behaviors are not a list.`, exit code 1                                       |

   `pnpm exec` adds the lines `[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command failed with exit code <n>` and its own exit code 1.

## 6. A list of references

Stop other servers. Make a copy of the list product and start the workbench with it (terminal 1):

```sh
rm -rf /tmp/a4-list
cp -r nodejs/wishem/workbench-app/tests/fixtures/list-product /tmp/a4-list
pnpm --filter @thrashplay/wishem-workbench-app start --product /tmp/a4-list
```

Result: the usual lines of section 1 (without a product code line). Open the page. The list has `Deck e_1f2a3b4c` and three `Card` items (`e_2a3b4c5d`, `e_3b4c5d6e`, `e_4c5d6e7f`). The name of an item is the label of its component type.

Select `Deck e_1f2a3b4c`. Result: the group `Deck` has the field `Cards` with the type `REFERENCE-LIST`. The list control shows two items, `Card · e_2a3b4c5d` and `Card · e_3b4c5d6e`, each with the button Remove. Below them are a select (`Add to Cards`) with the options `Deck · e_1f2a3b4c` and `Card · e_4c5d6e7f`, the button Add, and the button Clear.

The page driver has no step for this control. Do each action with the mouse. The writer drove the same controls with a Playwright script. Result of each action, with the list of `Cards` in `/tmp/a4-list/state.json`:

1. Press Remove of `Card · e_2a3b4c5d`. Result: the control shows one item, `e_3b4c5d6e`. The file has `["e_3b4c5d6e-..."]`. The select now also offers `Card · e_2a3b4c5d`.
2. Select `Card · e_4c5d6e7f` and press Add. Result: the items are `e_3b4c5d6e` and `e_4c5d6e7f`, in this order. The file has the two IDs in this order.
3. Select `Card · e_2a3b4c5d` and press Add. Result: three items (`e_3b4c5d6e`, `e_4c5d6e7f`, `e_2a3b4c5d`). The select offers only `Deck · e_1f2a3b4c`.
4. Press Clear (section 7 explains it). Result: the control shows `no value`, and the file has no `Cards` value. The select offers all four entities again.

## 7. Clear a field

Use the workbench of section 1 (start it again, with fresh copies). Script, terminal 2: `select:e_99969ed3 clear:Color.color`.

Result:

```text
Counter.count = 7
Color.color =  [no value]
```

(The count is the value that the copy holds.) The file `/tmp/a4-product/state.json` now has an empty object for the component type `Color`. It keeps the component. The row shows `no value`.

1. Clear a field with no value. Script: `select:e_99969ed3 clear:Color.color` again. Result: `error: step 2 clear:Color.color: the button Clear color is disabled`.
2. Set the value again. Script: `select:e_99969ed3 type:Color.color=#b91c1c`. Result: `Color.color = #b91c1c`, and the file has `"#b91c1c"` again.

## 8. Live values stay when an entity is added or removed

A running product construct holds live values (the count that the ticks changed). A change of the model of the product reaches it as inputs, and it keeps its live values. Do this with the workbench of section 1.

1. Terminal 2, script: `run waitfor:Running wait:500 pause`. Result: the status is Paused. The stage shows a count of the first count plus the ticks (the writer got `Count 109` at tick 9, with a first count of 100).
2. Add an entity by hand. Make the file `add.mjs` with the program below, and run `node add.mjs`. It adds a Counter entity with the count 500 to `/tmp/a4-product/state.json`.

   ```js
   import { readFileSync, writeFileSync } from 'node:fs'
   const f = '/tmp/a4-product/state.json'
   const s = JSON.parse(readFileSync(f, 'utf8'))
   s.entities.push({
     id: 'e_11111111-2222-4333-8444-555555555555',
     components: { 'ct_6af38bd9-a91d-49d9-9370-fa4e6c04769d': { 'fld_ef085a2e-22ef-4409-bac4-9cd5648d0705': 500 } },
   })
   writeFileSync(f, JSON.stringify(s, null, 2))
   ```

   Result, after about 1 second: the list has the new item `Counter e_11111111`. The stage shows `Count 109 Count 500`. The first count is the live value, and it does not go back to the value of the file (100).

3. Script: `step step`. Result: the stage shows `Count 111 Count 502`. The tick is 11.
4. Remove the entity by hand: delete the entity with the ID `e_11111111-...` from the file. Result: the item leaves the list. The stage shows `Count 111`. The live value of the first entity stays.

The same with the `wishem` command (section 5): after step 3, run `node add.mjs`, wait 1 second, and read the product construct (section 5, step 2). Result: the first entity keeps its live count (the writer saw the count 1 at tick 1, where the file has 0) and the second entity has the count 500.

A change of a value in the panel while the product construct runs reaches it in the same way. Script: `select:e_99969ed3 type:Counter.count=50 wait:800 step step`. Result: the stage shows `Count 52` at tick 2.

## 9. A warning that names its definition file

```sh
rm -rf /tmp/a4-dup
cp -r nodejs/wishem/sample-product/model /tmp/a4-dup
sed -i 's/"label": "Counter"/"label": "Color"/' /tmp/a4-dup/definitions/ct_6af38bd9-a91d-49d9-9370-fa4e6c04769d.json
pnpm --filter @thrashplay/wishem-workbench exec wishem start /tmp/a4-model --product /tmp/a4-dup --port 4748
```

Result:

```text
wishem: model /tmp/a4-model
wishem: product /tmp/a4-dup
wishem: warning in /tmp/a4-dup/definitions/ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512.json: Component types ct_6af38bd9-a91d-49d9-9370-fa4e6c04769d and ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512 have the same label "Color"
wishem: 1 component type, 1 entity
wishem: product: 2 component types, 1 entity
wishem: link at ws://127.0.0.1:4748/link
```

The command starts. Stop it with Ctrl+C.

## 10. Features for a program

These features have no screen. The program `nodejs/wishem/docs/milestones/a4-workbench/library-features.mjs` shows them. It needs only the built packages.

```sh
node nodejs/wishem/docs/milestones/a4-workbench/library-features.mjs
```

Result:

```text
1. tick 1: ["#b91c1c"] [1]
1. tick 2: ["#15803d"] [2]
2. add-reference: ["e_22222222-2222-4222-8222-222222222222","e_11111111-1111-4111-8111-111111111111"]
2. remove-reference: ["e_11111111-1111-4111-8111-111111111111"]
2. clear-field: undefined
2. the array of the caller is frozen: false
3. productChanges: ["product/add-entity"]
```

- Lines 1: the update subsystem runs the behaviors of the sample product. The count is a number (1, then 2), and the color goes to the next color at each tick.
- Lines 2: the store has a field type `reference-list`, the inputs `add-reference`, `remove-reference`, and `clear-field`, and it does not freeze the array that the caller gave.
- Line 3: `productChanges` turns the change of a product model into store inputs. One added entity gives one `add-entity`.

## Observed faults

The writer did each step and found no step that fails to give its result. The writer created no issue of the type `Bug`.

## What the milestone did not build

- The panel cannot add or remove an entity, change a definition, or add a component. A person edits the files for these changes (sections 2 and 8).
- The panel shows the authored values of the product. It does not show the live values of the running product construct. The stage shows them. The workbench does not write live values to `state.json`.
- The run controls and the stage work only for the product construct `play`. The workbench has no screen for more than one product construct.
- The views of the stage get no input port. The stage only draws.
- A running product construct keeps the product code that it loaded. A stop and a start load the new code.
- A relative `--product-code` path of the `wishem` command starts from the folder of the command process. `pnpm exec` sets that folder to `nodejs/wishem/workbench`.
- The page driver has no step for the control of a list of references. Only the buttons of a person, or a custom script, use it.
