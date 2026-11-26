# @thrashplay/wishem-workbench-app

The Wishem workbench application. The package holds the workbench page, the HTML renderer, the views, the `start` script, and the style guide. The design tokens, the components, and the screenshot tests of the style guide are also here.

## Start the workbench

Build the Wishem packages before the first start. The `start` script loads `host-nodejs` and `workbench` from their built files.

```
pnpm build --filter "@thrashplay/wishem-*"
pnpm --filter @thrashplay/wishem-workbench-app start
```

The script starts the core of the workbench and the page server in one Node.js process. It prints the model folder, the address of the core, and the address of the page. Open the address of the page in a web browser. Press Ctrl+C to stop both.

The page server listens on `127.0.0.1` only. It passes `GET /snapshot` and `GET /snapshots` to the core.

| Option            | Default                                            | Meaning                                         |
| ----------------- | -------------------------------------------------- | ----------------------------------------------- |
| `--model`         | the model folder of `@thrashplay/wishem-workbench` | The model folder.                               |
| `--port`          | `5173`                                             | The port of the page. `0`: the system selects.  |
| `--core-port`     | `4747`                                             | The port of the core. `0`: the system selects.  |
| `--views`         | `src/views/` of the package                        | The folder of the sidecars and generated files. |
| `--no-view-types` | off                                                | Do not keep the generated files current.        |

For example: `pnpm --filter @thrashplay/wishem-workbench-app start --model ./my-model --port 0`. A relative `--model` path starts from the folder where you run the command, not from the package folder.

While the script runs, it keeps the generated files of the views current. It runs the generator at the start, after each change to a definition that the core accepts, and after each change to a sidecar. A change to `state.json` does not run the generator. The script prints one line for each file that it wrote, changed, or removed, with the new and removed props. It prints each error of the generator and continues to serve the page. With `--no-view-types`, the script writes no generated file.

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
- `AppBar.view.gen.ts`: the generated types. It exports the type `Props`, with one read-only member for each field of the component type.

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

`playwright.config.ts` has two projects:

- `style-guide` runs `tests/style-guide.spec.ts`. The browser opens the static server in the container at `127.0.0.1:4173`.
- `workbench` runs `tests/workbench.spec.ts`. The browser opens the page of the real workbench at `127.0.0.1:4180`.

The `webServer` option of the config runs `scripts/e2e-server.ts` on the computer of the test runner. The script copies the model folder of the base workbench to `.e2e-model/` (git-ignored). It overwrites files and deletes nothing. Then it calls `startWorkbench`, the function of the `start` script, with that folder, core port 0, page port 4180, and the generator off. The tests then change no file in `src/views/`.

The browser is in the container and has no network path to the test runner. The connection of the `workbench` project has `exposeNetwork: '<loopback>'`. The browser then sends each request to a loopback address through the control connection to the test runner. The stream of snapshots passes through the same connection.

### How a test changes the model

Before each test, the test writes the original definition file and the original `state.json` to `.e2e-model/`. Then it opens the page and waits for the heading `Wishem`. A test changes the model with `node:fs` and waits for the picture with a web-first assertion. The tests only write in `.e2e-model/`, and in `src/views/AppBar.tsx` in the test of the view edit. That test writes the original view file again in a `finally` block.

### What Vite does after a change to a view file

The default export of a view file is a React component, and the renderer mounts it as a component. React Fast Refresh replaces the module in place, and the page shows the new picture with no reload. The test "an edit to the view of the app bar shows with no restart" proves that the page shows the change.

### Baselines of the page

`tests/__screenshots__/workbench-light.png` and `workbench-dark.png` hold the screenshots of the page. The browser takes them from the Vite development server, in the pinned browser image.

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

Text and marks on a bright fill use the role `on-fill` (`text-on-fill`, `border-on-fill`). `on-fill` has a contrast ratio of 4.5 or more on each fill.

### Forced states

The style guide shows the hover, active, and focus look of a component with no pointer and no key. The attribute `data-force` on a wrapper element forces the state. Its values are `hover`, `active`, and `focus`. The helper `Forced` in `src/style-guide/Forced.tsx` draws the wrapper.

A component does not use the Tailwind variants `hover:`, `active:`, `focus:`, `focus-visible:`, and `focus-within:`. It uses the variants of `src/styles/theme.css`: `st-hover`, `st-active`, `st-focus`, `st-focus-visible`, and `st-focus-within`. Each variant matches the real state, a forced state, and the content of a forced element. Thus the real state and the forced state use one style rule.

To keep a disabled control from reacting, write `enabled:st-hover:`, as the select does.

The browser tests compare the computed style of a forced specimen with the computed style of the same specimen in the real state.

## Components

`src/components/` holds the components. Each component takes all its content as props.

- `AppBar` (`title`): the night bar, 48 pixels high. It shows the title in lowercase in the display typeface, with a full stop in the `maker` color. A title that is too long ends with an ellipsis.
- `ZeroState` (`label`, `message`): a mono label and one line of text in the center of the space that it gets. Both texts use `fg-muted`.
- `Field` (`label`, `error`, `children`): a label above one control, and an optional error message below it. The label names the control. The error message describes the control and puts it in the error state. A control reads its field with the hook `useFieldControl`.
- `Select` (`options`, `value`, `onChange`, `placeholder`, `disabled`, `invalid`, `open`, `onOpenChange`, `id`): a select built on Base UI (`@base-ui/react`). It holds no value. `onChange` reports a selection, and the select shows a new value only when the caller gives it. A value that is not in `options` shows as text. The menu is below the trigger, as wide as the trigger, and does not lock the page. The `open` prop holds the menu open, for the style guide.
- `Button` (`variant`, `loading`, and each native `button` prop): `variant` is `maker`, `neutral` (default), `quiet`, or `danger`. The `type` is `button` unless the caller sets it. A loading button shows a spinner, has `aria-busy`, ignores a click, and stays in the focus order.
- `TextInput` (`invalid` and each native `input` prop): a single-line text control. It shows `value` and reports a change with `onChange`, or holds its own text from `defaultValue`. It takes its `id`, `aria-describedby`, and error state from its `Field`.
- `TextArea` (`invalid` and each native `textarea` prop): the multi-line text control, with the same behavior as `TextInput`. A person can drag its height and not its width.
- `Checkbox` (`checked`, `onChange`, `children`, and each native `input` prop except `type`): a native checkbox that the catalog draws, with the label in `children`. `onChange` gets the other boolean. The box shows `checked` until the caller gives a new value.
- `PromptBox` (`label`, `onSend`, `onStop`, `defaultValue`, `working`, `disabled`, `disabledReason`, `placeholder`, `minLines`, `maxLines`): a text area with a hint line and one button. It holds its text from `defaultValue`. Enter or `Make a wish` reports `onSend` with the text. Shift+Enter makes a new line. The text area grows from `minLines` (3) to `maxLines` (8) lines. While `working` is true, the text is read-only, `Stop` reports `onStop`, and focus moves between the text and `Stop`. `disabled` wins over `working` and shows `disabledReason` in the hint line. At the end of the work, the box becomes empty only when it reported `onSend` for this work and did not report `onStop` after it. In each other case, the text stays. A change of the text while `working` is false clears the record of the send.

### Rules for the props of a component

- A component does not accept `className` or `style`. `Native<'button'>` in `src/components/native.ts` gives the native props of an element with no `className` and no `style`.
- A component with variants selects the variant with a `variant` prop that has a fixed set of names.
- A control and a button pass each other native attribute to their element.
- A control that holds no value reports a change to its caller and shows the value that the caller gives.

### A popup is in the theme scope of its control

A popup draws itself in the element of the nearest `ThemeScope`. The hook `useThemeScopeElement` gives that element, or `null` when there is no scope. The popup then has the token values of the scope, the screenshot of the scope shows it, and axe checks it. A later popup follows the same rule.

A new component goes in the Components section of the style guide, in each of its states, in the same change. Each group of components is one file in `src/style-guide/sections/components/`. The helpers `Specimen`, `Forced`, and `StateMatrix` in `src/style-guide/` draw the specimens. The section shows the real component. It adds a screenshot test and an accessibility test for each theme. Run `test:ui:update` and commit the new baselines.

A state that a person uses has a row in `src/components/state-contrast.test.ts`. The row gives the foreground and the background of the text. The test calculates the contrast ratio from `tokens.css` in each theme. It fails when the ratio is less than 4.5, and it names the state and the theme. The `Section` of the style guide has the prop `layout`. The components section uses `stacked`, which draws the two scopes one above the other.

### Add a token

1. Add the custom property to `src/styles/tokens.css`. Write the value one time.
2. Add the name to a group in `src/tokens.ts`.
3. For a color role, add `--color-<name>: var(--<name>);` to `src/styles/theme.css`.
4. Run `pnpm test --filter @thrashplay/wishem-workbench-app`. The tests check that the two files have the same names. They also check the contrast rules of the specification.
5. Run `test:ui:update` and commit the new baselines. The style guide shows the new token with no other change.

## Fonts

The fonts come from the `@fontsource` packages, Latin subset only: Bricolage Grotesque (variable), Inter (variable, normal and italic), and JetBrains Mono (weights 400 and 500). `src/styles/theme.css` declares them.
