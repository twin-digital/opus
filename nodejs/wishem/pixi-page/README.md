# @thrashplay/wishem-pixi-page

The PixiJS page of Wishem. A page in a web browser draws the sample construct through the link. A page server serves the page. The package holds no construct. The package is private.

## What the page shows

The page shows a canvas of 640 by 360 pixels and one status line. The canvas has the color of the `color` field of the `Color` component of the sample construct. The color changes two times each second while the time runs: blue, red, green, amber, and then blue again. The page holds no hub. It reads the hub of the sample construct through the link.

## Build the dependencies

The `start` script runs in Node.js. Build the packages of Wishem one time after `pnpm install`:

```
pnpm build --filter "@thrashplay/wishem-pixi-page..."
```

## Start the sample construct and the page

Run the commands from the root of the repository, each in its own terminal. Start the sample construct first:

```
pnpm --filter @thrashplay/wishem-three-renderers construct
```

Then start the page server:

```
pnpm --filter @thrashplay/wishem-pixi-page start
```

The terminal of the page server shows two lines:

```
wishem: PixiJS page at http://127.0.0.1:5174/
wishem: the page connects to ws://127.0.0.1:4750/link
```

Open the page address in a web browser. Press Ctrl+C to stop the command. The command stops the page server and ends with exit code 0. It does not stop the sample construct.

| Option                | Effect                                                                     |
| --------------------- | -------------------------------------------------------------------------- |
| `--port <number>`     | The port of the page. Default 5174. Use 0 to let the system select a port. |
| `--hub-port <number>` | The port of the sample construct. Default 4750.                            |

The page server starts also when no construct runs. The page then shows "The construct is not reachable. The page tries again." and connects when the construct starts. When the page port is in use, the command writes `wishem: port <number> is in use` and ends with exit code 1.

The page server sends the WebSocket at `/link` to the sample construct on the hub port. The page opens `ws://<host of the page>/link`, so the page needs no setting. The hub refuses a link from a page of a different site (status 403).

## The keys

| Key    | Effect                              |
| ------ | ----------------------------------- |
| Space  | Pauses the time, or runs it again.  |
| Period | Sends one step of 500 milliseconds. |

A key sends an input through the input subsystem of the link. While the link is down, a key sends nothing.

## The status line

| State                 | Text                                                       |
| --------------------- | ---------------------------------------------------------- |
| Before the first link | Connecting to the construct.                               |
| With a link           | Connected (link N). Space: pause or run. Period: one step. |
| Without a link        | The construct is not reachable. The page tries again.      |

N is the number of the link since the page loaded. It starts at 1.

## Connect again after a stop

When the construct stops, the page keeps the last color. The page tries again after 500 milliseconds, then after a delay that doubles each time, at most 5 seconds. When the construct starts again, the status line shows the next link number, and the page draws the new construct. The page does not reload.

The page server runs with `server.ws: false`. The Vite client does not open its WebSocket, so it does not reload the page when the server comes back. A reload would hide the new link. The page has no hot reload. After a change to a view file, reload the page by hand.

## Add a PixiJS view

1. Add `src/views/<Name>.ts` with a default export of `{ create, update }`. See `src/views/ClearColor.ts`.
2. Add the sidecar `src/views/<Name>.view.json`: `{ "kind": "pixi", "componentType": "<ID of the component type>" }`.
3. Add a test in `src/views/<Name>.test.ts`.

`src/views.ts` collects each view of the folder. The README of `@thrashplay/wishem-renderer-pixi` describes the contract of a view.

## The screenshot test

The test starts the page server and the sample construct, and opens the page in a web browser. It proves the path of a tick through the link: from the clock in the sample construct to the picture in the page, and from a key in the page to the hub.

The browser runs in the pinned Playwright image in Docker, so the test needs Docker. When `docker info` fails, the command ends with exit code 1 and a message about Docker. The pull request checks run the same test.

| Command                                                     | Effect                              |
| ----------------------------------------------------------- | ----------------------------------- |
| `pnpm --filter @thrashplay/wishem-pixi-page test:ui`        | Runs the test against the baselines |
| `pnpm --filter @thrashplay/wishem-pixi-page test:ui:update` | Writes the baselines again          |

The test uses three parts:

1. The command `node scripts/start.ts --port 4181 --hub-port 4183` runs on the computer of the test runner. It holds the page server.
2. The test file starts the sample construct on port 4183 with the helper `tests/sample-construct.ts`. The construct starts paused at tick 0. The test file closes it at the end.
3. Chromium runs in the Docker container. It opens `http://127.0.0.1:4181/`. `exposeNetwork: '<loopback>'` carries the loopback traffic of the browser to the computer of the test runner. The page connects through the proxy `/link` of the page server to the construct.

The test does these steps:

1. It opens the page and waits for `data-ready` on the canvas and for the status "Connected (link 1)".
2. It compares the canvas with `tick-0.png` (blue).
3. It presses the period key. The canvas must match `tick-1.png` (red), and must differ from tick 0.
4. It waits 1500 milliseconds. The canvas must still match `tick-1.png`, because the time is paused.
5. It presses the space key. The canvas must change.

The reconnect test closes the construct and starts a new one on port 4183. The status line must show "Connected (link 2)" with no reload of the page.

A fault in the link, the proxy, the input subsystem, or the renderer makes step 2 or step 3 fail.

### Update the baselines

The baselines are in `tests/__screenshots__/`. Run `test:ui:update` after a planned change to the picture. Look at `tick-0.png` and `tick-1.png`, and commit them with the change. The pinned image is the only browser, so a baseline from a different computer is the same.
