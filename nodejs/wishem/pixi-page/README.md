# @thrashplay/wishem-pixi-page

The PixiJS page of Wishem. A construct runs in a Node.js process. A page in a web browser draws from the hub of the construct through the link. The package is private.

## What the page shows

The page shows a canvas of 640 by 360 pixels and one status line. The canvas has the color of the `Color` field of the construct. The color changes two times each second while the time runs: blue, red, green, amber, and then blue again. The page holds no hub. It reads the hub of the construct through the link.

## Build the dependencies

The `start` script runs in Node.js and uses the built packages of Wishem. Build them one time after `pnpm install`:

```
pnpm build --filter "@thrashplay/wishem-pixi-page..."
```

The build also makes `nodejs/wishem/hub/dist/`, which `rewind-client.mjs` uses.

## Start the construct and the page

Run the command from the root of the repository:

```
pnpm --filter @thrashplay/wishem-pixi-page start
```

The terminal shows the two addresses:

```
wishem: link at ws://127.0.0.1:4748/link
wishem: PixiJS page at http://127.0.0.1:5174/
```

Open the page address in a web browser. Press Ctrl+C to stop the command. The command stops the construct and then the page server, and ends with exit code 0.

| Option                | Effect                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------- |
| `--paused`            | The time starts with `running` set to `false`. The terminal shows a line that says so. |
| `--port <number>`     | The port of the page. Default 5174. Use 0 to let the system select a port.             |
| `--hub-port <number>` | The port of the hub. Default 4748. Use 0 to let the system select a port.              |

When a port is in use, the command writes `wishem: port <number> is in use`, stops each part that started, and ends with exit code 1.

The page server sends the WebSocket at `/link` to the hub. The page opens `ws://<host of the page>/link`, so the page needs no setting. The hub refuses a link from a page of a different site (status 403).

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

When the process stops, the page keeps the last color. The page tries again after 500 milliseconds, then after a delay that doubles each time, at most 5 seconds. When the process starts again, the status line shows the next link number, and the page draws the new construct. The page does not reload.

The page server runs with `server.ws: false`. The Vite client does not open its WebSocket, so it does not reload the page when the server comes back. A reload would hide the new link. The page has no hot reload. After a change to a view file, reload the page by hand.

## Rewind

A client of the link can rewind the construct. Start the command with `--paused`, press the period key some times, and run:

```
node nodejs/wishem/docs/milestones/a2-time/rewind-client.mjs --url ws://127.0.0.1:4748/link --seq 1
```

The page shows the color of the state after the target. Use `ws://127.0.0.1:5174/link` to send the rewind through the page server.

## Add a PixiJS view

1. Add `src/views/<Name>.ts` with a default export of `{ create, update }`. See `src/views/ClearColor.ts`.
2. Add the sidecar `src/views/<Name>.view.json`: `{ "kind": "pixi", "componentType": "<ID of the component type>" }`.
3. Add a test in `src/views/<Name>.test.ts`.

`src/views.ts` collects each view of the folder. The README of `@thrashplay/wishem-renderer-pixi` describes the contract of a view.

## The construct

The construct is a hub with two model subsystems and one input subsystem.

- `time`: the part `time` holds `now`, `ticks`, and `running`.
- `store`: the update subsystem (`createUpdate` of `@thrashplay/wishem-update`) with the store and the color behavior. It holds one entity with a `Clear color` component.
- `clock`: an input subsystem. It sends one `time/advance` for each 500 milliseconds of real time while `running` is `true`.

The hub is always in a Node.js process. This is the decision of the owner for the MVP. A renderer reaches the hub only through the link. `startPixiConstruct` serves the link at `ws://127.0.0.1:4748/link`. Use port 0 in a test to let the system select a port.

### The model

The model is in code. The construct has no storage subsystem. Each start begins at tick 0 with the first color.

```ts
import { CLEAR_COLOR_TYPE, COLOR_FIELD, COLORS, CONSTRUCT_MODEL, SCREEN_ENTITY } from './src/construct/model.js'

// One component type "Clear color" with one field "Color".
// One entity whose "Color" field is COLORS[0].
console.log(CONSTRUCT_MODEL.entities[0].components[CLEAR_COLOR_TYPE][COLOR_FIELD]) // '#1d4ed8'
```

`COLORS` holds four different colors: `#1d4ed8`, `#b91c1c`, `#15803d`, and `#a16207`.

### The color behavior

`colorBehavior` is a native behavior with the ID `pixi-page/color` and the component type `Clear color`. For each tick, it sets the `Color` field to `COLORS[ticks % 4]`. It is a pure function of the fields and the tick.

`createPixiHub` gives the hub `createTime` and `createUpdate({ store, behaviors: [colorBehavior] })`. The update subsystem has the ID `store`. It applies `time/advance`, runs the behavior, and writes the new fields through the store. It reads `ticks` from the part `time`, which is earlier in the order of the subsystems. If the joined state has no part `time`, it refuses the tick.

The record holds only the inputs of the clock. A replay or a rewind gives the same colors.

### The clock

`startPixiConstruct` does these steps in this order:

1. It makes the hub with `createPixiHub`.
2. It calls `serveHub` of `@thrashplay/wishem-host-nodejs`.
3. It starts the hub.
4. It attaches the input subsystem `clock` and calls `startClock` with a step of 500 milliseconds (`STEP_MS`).

With the option `paused`, the part `time` starts with `running` set to `false`. A client of the link can send `time/set-running` to change the value.

```ts
import { startPixiConstruct } from './src/construct/process.js'

const construct = await startPixiConstruct({ port: 4748 })
console.log(construct.linkUrl) // ws://127.0.0.1:4748/link
await construct.close() // stops the clock, the hub, and the server
```

If the port is in use, `startPixiConstruct` rejects with the error (`EADDRINUSE`). No hub and no clock run. `close()` gives the same promise on each call.

## The screenshot test

The test starts the real command and opens the page in a web browser. It proves the path of a tick through the link: from the clock in the Node.js process to the picture in the page, and from a key in the page to the hub.

The browser runs in the pinned Playwright image in Docker, so the test needs Docker. When `docker info` fails, the command ends with exit code 1 and a message about Docker. The pull request checks run the same test.

| Command                                                     | Effect                              |
| ----------------------------------------------------------- | ----------------------------------- |
| `pnpm --filter @thrashplay/wishem-pixi-page test:ui`        | Runs the test against the baselines |
| `pnpm --filter @thrashplay/wishem-pixi-page test:ui:update` | Writes the baselines again          |

The test uses two processes:

1. The command `node scripts/start.ts --port 4181 --hub-port 0 --paused` runs on the computer of the test runner. It holds the construct, the hub, and the page server. Each run starts a new construct at tick 0.
2. Chromium runs in the Docker container. It opens `http://127.0.0.1:4181/`. `exposeNetwork: '<loopback>'` carries the loopback traffic of the browser to the computer of the test runner. The page connects through the proxy `/link` of the page server to the hub.

The test does these steps:

1. It opens the page and waits for `data-ready` on the canvas and for the status "Connected (link 1)".
2. It compares the canvas with `tick-0.png` (blue).
3. It presses the period key. The canvas must match `tick-1.png` (red), and must differ from tick 0.
4. It waits 1500 milliseconds. The canvas must still match `tick-1.png`, because the time is paused.
5. It presses the space key. The canvas must change.

A fault in the link, the proxy, the input subsystem, or the renderer makes step 2 or step 3 fail.

### Update the baselines

The baselines are in `tests/__screenshots__/`. Run `test:ui:update` after a planned change to the picture. Look at `tick-0.png` and `tick-1.png`, and commit them with the change. The pinned image is the only browser, so a baseline from a different computer is the same.
