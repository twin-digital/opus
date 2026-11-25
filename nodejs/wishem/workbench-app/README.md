# @thrashplay/wishem-workbench-app

The Wishem workbench application. The package holds the workbench page and the style guide. The design tokens, the components, and the screenshot tests of the style guide are also here.

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
4. It removes the container.

The job `ui-tests` of the pull request checks runs the same command on a runner that has Docker. A baseline from a development computer passes in the checks.

The environment variable `WISHEM_BROWSER_HOST` replaces the host name of the browser server. By default, the host is the host of `DOCKER_HOST`, or `127.0.0.1`.

## Update the baselines

```
pnpm --filter @thrashplay/wishem-workbench-app test:ui:update
```

The command writes the baseline images in `tests/__screenshots__/`. Commit the images that change.

Before each screenshot, the test hides every part of the page except the section and its ancestors. The section then starts at the same offset whatever the other sections hold. A change to one section changes only the baselines of that section.

## Run a different command with the browser

`scripts/browser-server.js` runs any command. It starts the browser container and sets `WISHEM_BROWSER_WS_ENDPOINT` to the address of the browser server:

```
node scripts/browser-server.js <command> [args...]
```

## Design tokens

`src/styles/tokens.css` holds the value of each token. It is the only place for a value. A role that changes with the theme uses `light-dark()`.

The theme follows the color scheme of the system. The workbench has no control that changes the theme. The component `ThemeScope` forces a theme on its content. The style guide and the tests use it.

### A component uses roles only

A component uses roles only. A role gives the purpose of a color, for example `bg-ground`, `text-fg-muted`, or `text-maker-text`. A component does not use a palette color or a color value. A palette color has no Tailwind class. A test fails when a file in `src/components/` has a hexadecimal color or the name of a palette color.

### Add a token

1. Add the custom property to `src/styles/tokens.css`. Write the value one time.
2. Add the name to a group in `src/tokens.ts`.
3. For a color role, add `--color-<name>: var(--<name>);` to `src/styles/theme.css`.
4. Run `pnpm test --filter @thrashplay/wishem-workbench-app`. The tests check that the two files have the same names. They also check the contrast rules of the specification.
5. Run `test:ui:update` and commit the new baselines. The style guide shows the new token with no other change.

## Fonts

The fonts come from the `@fontsource` packages, Latin subset only: Bricolage Grotesque (variable), Inter (variable, normal and italic), and JetBrains Mono (weights 400 and 500). `src/styles/theme.css` declares them.
