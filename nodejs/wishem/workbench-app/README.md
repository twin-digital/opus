# @thrashplay/wishem-workbench-app

The Wishem workbench application. The package holds the workbench page, the views, the `start` script, and the style guide. The page gives the port of each link to the renderer of `@thrashplay/wishem-renderer-react`. The generator of the types of the props is also in that package. The design tokens, the components, and the screenshot tests of the style guide are also here.

## Start the workbench

Build the Wishem packages before the first start. The `start` script loads `host-nodejs`, `workbench`, and the generator of `@thrashplay/wishem-renderer-react` from their built files.

```
pnpm build --filter "@thrashplay/wishem-*"
pnpm --filter @thrashplay/wishem-workbench-app start
```

The script starts one construct and the page server in one Node.js process. It prints the model folder, the address of the link (for example `ws://127.0.0.1:4747/link`), and the address of the page. Open the address of the page in a web browser. Press Ctrl+C to stop both.

The page server listens on `127.0.0.1` only. The Vite proxy passes the WebSocket at `/link` of the page address to the server of the construct, with the `Origin` header of the page. The Vite proxy passes no other path. The path `/constructs/<id>/link` has its own passage (see "Product constructs"). The page uses the client of the hub (`connectHub`) to open its link at `/link` on the origin of the page. The link has two subsystems: the output subsystem `page-<hex>` and the input subsystem `page-<hex>-input`. The client makes `<hex>` one time, and uses it for each link of the page load. It makes a new `<hex>` only after the hub refuses a link with `id-in-use`. The source of each input of the page is the ID of the input subsystem, so it is the same for the whole load. After each `welcome`, the client gives the two remote ports of the new link to `onPorts({ output, input })`. The page draws from `output`, and the views send inputs through `input`.

| Option            | Default                                            | Meaning                                         |
| ----------------- | -------------------------------------------------- | ----------------------------------------------- |
| `--model`         | the model folder of `@thrashplay/wishem-workbench` | The model folder.                               |
| `--product`       | none                                               | The folder of a product model to mount.         |
| `--product-code`  | none                                               | The module with the rules of the product.       |
| `--product-views` | none                                               | The folder of the React views of the product.   |
| `--port`          | `5173`                                             | The port of the page. `0`: the system selects.  |
| `--hub-port`      | `4747`                                             | The port of the hub. `0`: the system selects.   |
| `--views`         | `src/views/` of the package                        | The folder of the sidecars and generated files. |
| `--no-view-types` | off                                                | Do not keep the generated files current.        |

For example: `pnpm --filter @thrashplay/wishem-workbench-app start --model ./my-model --port 0`. A relative `--model` or `--product` path starts from the folder where you run the command, not from the package folder.

With `--product`, the script mounts the model of that folder as the store `product` of the construct. It prints `wishem: product <absolute path>` after the model line. The page shows the part `product` in the product panel (see "The product panel"). To start the workbench with the sample product, from the root of the repository:

```
pnpm --filter @thrashplay/wishem-workbench-app start --product nodejs/wishem/sample-product/model
```

### Product constructs

With `--product`, the script adds the construct list (the model subsystem `constructs`) to the construct of the workbench and attaches the construct manager. The `welcome` message of the link then has the parts `store`, `product`, and `constructs`. A client of the link starts a product construct with the input `constructs/start`. The product construct runs in the process of the script, with its own link on a port that the system selects. The script prints `wishem: construct <id> runs, link at <address>`. The construct manager gives the product construct each later change of the product model. When the script stops, it stops the product constructs first.

The option `--product-code <module>` names the product code. The module exports `behaviors`, the list of the native behaviors of the product. Each product construct runs them in each tick. The script stops with a message when `behaviors` is not a correct list. The value is a package name, or a path that starts with `.` or `/`. A relative path starts from the folder where you run the command. The script prints `wishem: product code <value>` after the product line. The option needs `--product`. With no option, a product construct has no behaviors.

To start the workbench with the sample product and its behaviors, from the root of the repository:

```
pnpm --filter @thrashplay/wishem-workbench-app start --product nodejs/wishem/sample-product/model --product-code @thrashplay/wishem-sample-product
```

Then start a product construct and read its address. In a second terminal, from the root of the repository:

```
RAW=nodejs/wishem/docs/milestones/a1-construct/raw-link.mjs
node $RAW --once --send '{"type":"constructs/start","payload":{"construct":"play"}}'
PLAY=$(node $RAW --once | grep -o 'ws://127.0.0.1:[0-9]*/link')
node $RAW --url $PLAY --once
```

The last command prints the state of the product construct. The count of the sample product advances at each tick. To pause the product construct, send `constructs/send` with `{"type":"time/set-running","payload":{"running":false}}` as its `input`.

The page address also carries the link of each product construct that runs. The WebSocket at `/constructs/<id>/link` of the page address reaches the link of the product construct `<id>`. The page server writes the request with the path `/link` to the port of the construct and pipes the two connections. For an ID with no running product construct, the page server answers with the status 404. The connection ends when the product construct stops. The path `/link` still reaches the workbench.

The option `--product-views <folder>` names a folder of React views of the product. Each view is a pair of a file `<name>.view.json` and a file `<name>.tsx`. A file `*.test.tsx` is not a view. A relative path starts from the folder where you run the command. The script prints `wishem: product views <absolute path>` after the line of the product code, or after the line of the product. The option needs `--product`, and the folder must exist. Otherwise the script prints the reason and stops with exit code 1. The page server answers `GET /@wishem/product-views.json` with the pairs of the folder, as `{ "views": [{ "sidecar": "/@fs/...", "view": "/@fs/..." }] }`. With no option, the answer is `{ "views": [] }`. When a person adds or removes a sidecar or a view file, the page loads again. To start the workbench with the views of the sample product, from the root of the repository:

```
pnpm --filter @thrashplay/wishem-workbench-app start --product nodejs/wishem/sample-product/model --product-code @thrashplay/wishem-sample-product --product-views nodejs/wishem/sample-product/views/react
```

While the script runs, it keeps the generated files of the views current. It runs the generator at the start, after each change to a definition that the hub accepts, and after each change to a sidecar. A change to `state.json` does not run the generator. The script prints one line for each file that it wrote, changed, or removed, with the new and removed props. It prints each error of the generator and continues to serve the page. With `--no-view-types`, the script writes no generated file.

### Run controls and stage

With a part `constructs`, the page shows the run area: an `aside` named `Run` with the run controls and the stage. From 1200 pixels of width, the run area is at the right of the product panel. Below 1200 pixels, it is above the product panel.

The run controls control the product construct `play`. The toolbar `Product controls` has these buttons:

| Button    | Input to the workbench                                                                   |
| --------- | ---------------------------------------------------------------------------------------- |
| Run       | `constructs/start`. After a failure: `constructs/stop`, then `constructs/start`.         |
| Stop      | `constructs/stop`.                                                                       |
| Pause     | `constructs/send` with `time/set-running` and `running` set to `false`.                  |
| Resume    | `constructs/send` with `time/set-running` and `running` set to `true`.                   |
| Step      | `constructs/send` with `time/advance`. The length is `stepMs` of the part `time`, or 50. |
| Step back | `constructs/rewind` with `ticks` set to `1`.                                             |

Each input goes through the input port of the page. A button is disabled while a control waits for its outcome, and when the page has no input port. A control that the workbench refuses shows the line `Not done.` with the reason. A pass that the product construct refuses shows a line with the name of the control. A control waits at most 5 seconds for the result of its pass. The next accepted control removes the line. The toolbar also shows the status, the tick, and the time in seconds.

The stage opens a link at `/constructs/play/link` while `play` runs. The link has one output subsystem `page-<hex>-stage`. The stage draws the part `store` of that link with the React views of the product, and it gives the views no input port. The stage shows a zero state when it has no picture: `play` does not run, the link connects, the page has no views of the product, or the views are not correct. When the link is down, the stage keeps the last picture and shows a note. The page loads the views of the product with `GET /@wishem/product-views.json` (see `--product-views`).

### Change the picture by hand

Edit a file in the model folder and save it. The page shows the new model. For example, in a second terminal, from the root of the repository:

```
sed -i 's/"Wishem"/"Hello"/' nodejs/wishem/workbench/model/state.json
```

The edit changes a tracked file. To restore it, run this command from the root of the repository:

```
git checkout -- nodejs/wishem/workbench/model/state.json
```

### Where a problem appears

- A problem in a model file appears in the terminal that runs `start`. The page keeps the last correct picture.
- A problem in a sidecar, a sidecar with no component type definition, or two labels that give one prop name appears in the browser console.
- The errors and the warnings of the generator appear in the terminal that runs `start`.
- A sidecar that is not valid JSON stops the page in the web browser with an error of Vite. The generator names the file in the terminal.
- When the model is not correct at the start, the script prints each problem and stops with exit code 1.
- When a port is in use, the script prints the port and stops with exit code 1.

### Add a view

1. Add the view file to `src/views/`, for example `src/views/Header.tsx`. The default export is a React component.
2. Add the sidecar `src/views/Header.view.json` with the kind and the ID of the component type: `{ "kind": "react", "componentType": "ct_..." }`. Use the ID from the definition file in the model folder.
3. Write the generated types: `pnpm --filter @thrashplay/wishem-workbench-app generate`.
4. Import the type `Props` from `./Header.view.gen.js` in the view file.
5. Save the files. Vite shows the new view in the page.

## Views

A view has three files in `src/views/`. The files have one base name, for example `AppBar`:

- `AppBar.tsx`: the view file.
- `AppBar.view.json`: the sidecar. It holds the kind of the view and the ID of its component type: `{ "kind": "react", "componentType": "ct_..." }`.
- `AppBar.view.gen.ts`: the generated types. It exports the type `Values`, with one member for each field of the component type, and the type `Props`. `Props` has one read-only member for each field, and the member `wishem` that sends inputs.

The name of a prop comes from the label of its field. The rule divides the label into words at each run of characters that are not ASCII letters or digits. The first word starts with a lower case letter. Each other word starts with an upper case letter. For example, the label `Max health` gives the prop `maxHealth`.

### Write the generated types

```
pnpm --filter @thrashplay/wishem-workbench-app generate
```

The script reads the model folder of `@thrashplay/wishem-workbench` and the sidecars in `src/views/`. It prints one line for each file that it wrote, changed, or removed. It prints nothing for a file that did not change.

The script stops with exit code 1 when the model is not correct, when a sidecar is not valid JSON or has no `componentType`, when the `views` folder cannot be read, or when a label gives no usable name. A label gives no usable name when it gives an empty name, a name that starts with a digit, or the same name as another field of the component type. The script writes no file for that sidecar.

Commit each generated file. A test of the package fails when a generated file is not current.

| Option    | Default                                            | Meaning                                                       |
| --------- | -------------------------------------------------- | ------------------------------------------------------------- |
| `--check` | off                                                | Change no file. Stop with exit code 1 for a file not current. |
| `--model` | the model folder of `@thrashplay/wishem-workbench` | The model folder.                                             |
| `--views` | `src/views/` of the package                        | The folder of the sidecars. The script writes the files here. |

For example, to check that the files are current:

```
pnpm --filter @thrashplay/wishem-workbench-app generate --check
```

A relative `--model` or `--views` path starts from the folder where you run the command.

## Change the title in the page

The title of the app bar is a button with the tooltip `Change the title`. To change the title:

1. Select the title with the mouse, or move to it with Tab and press Enter or Space. A text field opens with the title, and all its text is selected.
2. Type the new title. The field shows the case that you type. Enter saves it. A move of the focus out of the field also saves it.
3. To cancel, press Escape. The field closes and the title does not change.

A new text that is empty or the same as the title closes the field and sends no input. While the app bar waits for the answer of the workbench, the field is read-only and the label `SAVING` shows beside it. After the workbench accepts the change, the field closes and the focus goes to the title.

When the workbench does not accept the change, the field stays open with your text. A line below the bar shows `The title is not saved.` and the reason. A new Enter sends the change again. A move of the focus does not send it again.

The file `src/outcome-text.ts` makes the text of the reason:

| Reason                                    | Text                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| `not-running`                             | `The workbench does not run. Start it, and try again.`                        |
| `unknown`                                 | `The connection ended before an answer. Look at the title after it connects.` |
| `not-permitted`                           | `This page cannot send changes.`                                              |
| `invalid` with a problem                  | The message of the first problem.                                             |
| `invalid` with no problem, `unknown-type` | `The workbench refused the change.`                                           |
| `failed`                                  | `The workbench failed to apply the change.`                                   |

## The product panel

With the part `product` in the joined state of the link, the page shows the product panel below the pictures of the views. Without that part, the page shows the zero state. `ProductTool` in `src/tools/` reads the part with `usePart` and gives it to `ProductPanel` of the catalog. The tool is not a view. The `Renderer` still reads only the part `store`.

- The list shows each entity with its name and the first 10 characters of its ID. Select an entity to see its inspector. The selection is state of the page. A reload clears it.
- The inspector shows one group for each component of the entity, and one row for each field. A text field changes a `string` or a `number`. A check box changes a `boolean`. A select changes a `reference`.
- Enter or a move of the focus commits a text field. Escape restores the value of the part. A text that is not a number gives the alert `Type a number.` and sends no input.
- A commit sends one `product/set-field` input through the input port of the page. The record of the hub holds the source `page-<hex>-input`. The storage subsystem of the product writes the `state.json` of the product folder.
- A reason why the workbench does not accept the change shows below the row, with the text of `src/outcome-text.ts`.
- A hand edit of the `state.json` of the product folder shows in the panel with no reload. A rewind of the hub restores the value in the panel and in the file.
- When a hand edit removes the selected entity, the panel clears the selection. If the focus was in the inspector, the focus moves to the list.

The browser tests of the panel are in the Playwright project `product` (`tests/product.spec.ts`). `scripts/e2e-server.ts --product` starts a second workbench on port 4184. It mounts a copy of the sample product from `.e2e-product/` and uses the model folder copy `.e2e-product-model/`. Both folders are git-ignored. It loads no product code.

## Start the style guide

```
pnpm --filter @thrashplay/wishem-workbench-app style-guide
```

The command starts the Vite development server and opens `/style-guide.html`.

## Build

```
pnpm build --filter @thrashplay/wishem-workbench-app
```

The build writes the workbench page to `dist/`. The style guide is not in this build.

## Run the screenshot tests

```
pnpm --filter @thrashplay/wishem-workbench-app test:ui
```

The tests need Docker. They run in the Playwright image `mcr.microsoft.com/playwright:v<version>-noble`, where `<version>` is the installed version of `@playwright/test`. The command does these steps:

1. It makes the test build (`vite build --mode style-guide`) in `dist-style-guide/`.
2. It starts the image on the Docker host and copies the test build into the container.
3. It runs `playwright test` and connects to the browser in the container.
4. It removes the container, also when the script gets SIGINT, SIGTERM, or SIGHUP.

The job `ui-tests` of the pull request checks runs the same command on a runner that has Docker. A baseline from a development computer passes in the checks.

The environment variable `WISHEM_BROWSER_HOST` replaces the host name of the browser server. By default, the host is the host of `DOCKER_HOST`. When `DOCKER_HOST` is not set, it is the host of the active Docker context. When the endpoint is not `ssh://` or `tcp://`, it is `127.0.0.1`.

When the host is a loopback name (`localhost`, `127.x.x.x`, or `::1`), the script publishes the port of the browser server on the loopback address only. For another host, it publishes the port on all interfaces of the Docker host.

## Browser tests of the workbench page

`playwright.config.ts` has three projects:

- `style-guide` runs `tests/style-guide.spec.ts`. The browser opens the static server in the container at `127.0.0.1:4173`.
- `workbench` runs `tests/workbench.spec.ts`. The browser opens the page of the real workbench at `127.0.0.1:4180`.
- `product` runs `tests/product.spec.ts`. The browser opens the page of the workbench with the sample product at `127.0.0.1:4190`.

The `webServer` option of the config runs `scripts/e2e-server.ts` (and `scripts/e2e-server.ts --product`) on the computer of the test runner. The script copies the model folder of the base workbench to `.e2e-model/` (git-ignored). It overwrites files and deletes nothing. Then it calls `startWorkbench`, the function of the `start` script, with that folder, hub port 0, page port 4180, and the generator off. The tests then change no file in `src/views/`.

The browser is in the container and has no network path to the test runner. The connection of the `workbench` project has `exposeNetwork: '<loopback>'`. The browser then sends each request to a loopback address through the control connection to the test runner. The WebSocket of the link at `/link` passes through the same connection.

### How a test changes the model

Before each test, the test writes the original definition file and the original `state.json` to `.e2e-model/`. Then it opens the page and waits for the heading `Wishem`. A test changes the model with `node:fs` and waits for the picture with a web-first assertion. The tests only write in `.e2e-model/`, and in `src/views/AppBar.tsx` in the test of the view edit. That test writes the original view file again in a `finally` block.

### What Vite does after a change to a view file

The default export of a view file is a React component, and the renderer mounts it as a component. React Fast Refresh replaces the module in place, and the page shows the new picture with no reload. The test "an edit to the view of the app bar shows with no restart" proves that the page shows the change.

### Baselines of the page

`tests/__screenshots__/workbench-light.png` and `workbench-dark.png` hold the screenshots of the page. `product-light.png` and `product-dark.png` hold the screenshots of the page with the sample entity selected. The browser takes them from the Vite development server, in the pinned browser image.

## Update the baselines

```
pnpm --filter @thrashplay/wishem-workbench-app test:ui:update
```

The command writes the baseline images in `tests/__screenshots__/`. Commit the images that change.

Before each screenshot, the test hides every part of the page except the section and its ancestors. The section then starts at the same offset whatever the other sections hold. A change to one section changes only the baselines of that section.

## Run a different command with the browser

`scripts/browser-server.ts` runs any command. It starts the browser container and sets `WISHEM_BROWSER_WS_ENDPOINT` to the address of the browser server:

```
node scripts/browser-server.ts <command> [args...]
```

## Design tokens

`src/styles/tokens.css` holds the value of each token. It is the only place for a value. A role that changes with the theme uses `light-dark()`.

The theme follows the color scheme of the system. The workbench has no control that changes the theme. The component `ThemeScope` forces a theme on its content. The style guide and the tests use it.

### A component uses roles only

A component uses roles only. A role gives the purpose of a color, for example `bg-ground`, `text-fg-muted`, or `text-maker-text`. A component does not use a palette color or a color value. A palette color has no Tailwind class. A test fails when a file in `src/components/` has a hexadecimal color or the name of a palette color.

## Components

`src/components/` holds the components. Each component takes all its content as props.

- `AppBar` (`title`, `onRename`, `initial`): the night bar, 48 pixels high. It shows the title in lowercase in the display typeface, with a full stop in the `maker` color. A title that is too long ends with an ellipsis. With `onRename`, the title is a button. `initial` sets the first state of the edit, for the style guide and the tests.
- `ZeroState` (`label`, `message`): a mono label and one line of text in the center of the space that it gets. Both texts use `fg-muted`.
- `FieldRow` (`field`, `value`, `options`, `onChange`, `initial`): one field of a component, with a control for its type (text, number, check box, or reference select). It sends the value with `onChange` and shows the phase: saved, saving, or not saved with a reason. `initial` sets the first phase, for the style guide and the tests.
- `EntityList` (`items`, `selected`, `onSelect`): the list of entities. Each item shows a name and a short ID. The selected item has a bar at the start edge.
- `EntityInspector` (`entity`, `options`, `onChange`): the full ID and the components of one entity, each with a `FieldRow` for each field. With no `entity`, it shows "Select an entity to change it."
- `ProductPanel` (`model`, `selected`, `onSelect`, `onChange`): the list and the inspector of the entities of a model. It makes the names and the options from the model, and it sends a `SetFieldPayload` with `onChange`.

A new component goes in the Components section of the style guide, in each of its states, in the same change. The section shows the real component. It adds a screenshot test and an accessibility test for each theme. Run `test:ui:update` and commit the new baselines.

### Add a token

1. Add the custom property to `src/styles/tokens.css`. Write the value one time.
2. Add the name to a group in `src/tokens.ts`.
3. For a color role, add `--color-<name>: var(--<name>);` to `src/styles/theme.css`.
4. Run `pnpm test --filter @thrashplay/wishem-workbench-app`. The tests check that the two files have the same names. They also check the contrast rules of the specification.
5. Run `test:ui:update` and commit the new baselines. The style guide shows the new token with no other change.

## Fonts

The fonts come from the `@fontsource` packages, Latin subset only: Bricolage Grotesque (variable), Inter (variable, normal and italic), and JetBrains Mono (weights 400 and 500). `src/styles/theme.css` declares them.
