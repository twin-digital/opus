# three-renderers

`@thrashplay/wishem-three-renderers` holds the sample construct of Wishem and its command, and the React page that draws it. It is private.

The sample construct (**Proposed** term) is the product construct of the sample product. It runs in a Node.js process of its own. It has the `time` subsystem, the update subsystem with the count behavior and the color behavior, and a clock with a step of 500 milliseconds. It reads the model folder of `sample-product` and writes no file. The renderers draw it through its link.

## Start the sample construct

The commands need the builds of their dependencies: `pnpm build --filter "@thrashplay/wishem-three-renderers..."`.

```
pnpm --filter @thrashplay/wishem-three-renderers construct [--paused] [--hub-port <number>]
```

| Option             | Meaning                                                                    |
| ------------------ | -------------------------------------------------------------------------- |
| `--paused`         | The time of the construct starts paused.                                   |
| `--hub-port <num>` | The port of the link. Default 4750. Use 0 to let the system select a port. |

The command prints the address of the link:

```
wishem: link at ws://127.0.0.1:4750/link
```

With `--paused`, it first prints `wishem: the time of the construct starts paused`.

If the port is in use, the command prints `wishem: port <n> is in use` and ends with exit code 1. A value of `--hub-port` that is not a number from 0 to 65535 also gives exit code 1. `SIGINT` and `SIGTERM` send `stopping` on each open link and end the command with exit code 0.

## Use from code

```ts
import { startSampleConstruct } from '@thrashplay/wishem-three-renderers'

const construct = await startSampleConstruct({ port: 0, paused: true })
console.log(construct.linkUrl)
await construct.close()
```

`startSampleConstruct` rejects with `EADDRINUSE` when the port is in use. `close()` gives the same promise on each call.

## Start the React page

```
pnpm --filter @thrashplay/wishem-three-renderers react-page [--port <number>] [--hub-port <number>]
```

| Option             | Meaning                                                                           |
| ------------------ | --------------------------------------------------------------------------------- |
| `--port <num>`     | The port of the page server. Default 5175. Use 0 to let the system select a port. |
| `--hub-port <num>` | The port of the sample construct. Default 4750.                                   |

The command prints the address of the page and the address that the page connects to:

```
wishem: React page at http://127.0.0.1:5175/
wishem: the page connects to ws://127.0.0.1:4750/link
```

The page server starts also when no construct runs. The page then shows "The construct is not reachable. The page tries again." and connects when the construct starts.

If the page port is in use, the command prints `wishem: port <n> is in use` and ends with exit code 1. A value of `--port` or `--hub-port` that is not a number from 0 to 65535 also gives exit code 1. `SIGINT` and `SIGTERM` stop the page server and end the command with exit code 0. The command does not stop the sample construct.

## The React page

The page shows a box of 640 by 360 pixels and one status line. The view `ClearColor` fills the box with the color of the `Color` component of the sample construct. The color changes two times each second.

The color is a text of the form `#rrggbb`, with upper or lower case digits. The view draws it in lower case. When the color has no value, or has any other value, the view fills the box with the fallback color `#ff00ff`. The view is never empty.

| Status line                                           | When                           |
| ----------------------------------------------------- | ------------------------------ |
| Connecting to the construct.                          | Before the first link.         |
| Connected (link N).                                   | A link is open. N starts at 1. |
| The construct is not reachable. The page tries again. | The link is down.              |

While the link is down, the box keeps the last picture. The page opens a new link after 500 milliseconds, then after a delay that doubles each time, at most 5 seconds. A new link draws its state with no reload.

The page opens one link at `/link` of its own address, with one output subsystem and no input subsystem. It sends no input. The view declares its props by hand in `src/views/ClearColor.tsx`.

## The test from end to end

```
pnpm --filter @thrashplay/wishem-three-renderers test:ui
```

The test needs Docker. Docker runs the pinned browser image and the Godot image. The two test files run one after the other.

The test starts the sample construct paused, the React page, the PixiJS page, and the Godot application. It opens the two pages in a browser and opens a link of its own to the construct. Each step reads the joined state from the hub and compares the pixels of each renderer with the color of that state.

| Step                            | Check                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| First picture                   | Each pixel of the three pictures is `#1d4ed8`.                                     |
| `time/advance` of 500           | Each picture is `#b91c1c` within 5 seconds, and the two pages changed.             |
| Wait of 1500 ms                 | The two page pictures stay the same, and Godot makes no new shot.                  |
| `time/set-running` with `true`  | Each picture leaves `#b91c1c` within 5 seconds.                                    |
| `time/set-running` with `false` | Each picture has the color of the last tick within 2 seconds, and then stays.      |
| Period key and space key        | The keys of the PixiJS page step and run the clock, and the three pictures follow. |
| Size of the Godot shot          | The first shot is 640 by 360 pixels.                                               |

The test stops the link, the browser, the Godot run, and the three child processes in a `finally` block. After the test, `docker ps -a` shows no container of Godot.

The second file, `tests/three-renderers.lifecycle.guide.ui.test.ts`, starts the pages and Godot before the construct. It checks the text of each part while the construct is absent. It stops the construct with `SIGINT`, starts it again on the same port, and checks that the pages do not reload. It starts a second construct on the same port and a workbench, and checks the exit codes. It ends each part with `SIGINT`, checks the exit code 0 of each, and checks that no container of Godot is left. The workbench needs its build: `pnpm build --filter @thrashplay/wishem-workbench-app...`.
