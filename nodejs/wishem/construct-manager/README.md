# @thrashplay/wishem-construct-manager

The construct manager of the Wishem workbench. This package holds the construct list and the function that turns a change of a product model into inputs.

The package is private. The root entry uses no Node.js API. The entry `node` (`@thrashplay/wishem-construct-manager/node`) holds the construct manager, which starts and feeds the product constructs.

## The construct list

`createConstructList()` makes the model subsystem with the ID `constructs`. Its first part is `{ constructs: {} }`. Each entry of `constructs` is under the ID of a construct, and holds:

- `want`: `running` or `stopped`. The wanted state.
- `startTime`: `running` or `paused`. The time state when the construct starts.
- `startSeq`: The sequence number, in the workbench record, of the `constructs/start` that wrote the entry.
- `status`: `pending`, `running`, `stopped`, or `failed`. What the construct manager reported last.
- `link`, `time`: only with the status `running`.
- `message`, `lastSend`: optional.

The ID of a construct has the form of the ID of a subsystem, for example `play`. The list has five inputs. `constructInputs` makes them. An input that changes nothing returns the same part. The list refuses each input that is not correct with the reason `invalid` and a problem with a path.

| Input               | Effect                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `constructs/start`  | Sets `want` to `running`. A new or stopped entry gets the status `pending` and the `startSeq` of the input.                 |
| `constructs/stop`   | Sets `want` to `stopped`. The entry stays. The construct must be in the list.                                               |
| `constructs/send`   | Changes no part. The construct must be wanted to run and have the status `running`.                                         |
| `constructs/rewind` | Changes no part. The construct must be wanted to run and have the status `running`. `ticks` is an integer of 1 or more.     |
| `constructs/report` | Sets the reported fields. Only the source `construct-manager` can send it. `stopped` and `failed` remove `link` and `time`. |

```ts
import { createStore } from '@thrashplay/wishem-core'
import { createHub } from '@thrashplay/wishem-hub'
import { CONSTRUCT_MANAGER_ID, constructInputs, createConstructList } from '@thrashplay/wishem-construct-manager'

const hub = createHub({ subsystems: [createStore(), createConstructList()] })
const client = hub.attach({ id: 'client', kind: 'input' })
const manager = hub.attach({ id: CONSTRUCT_MANAGER_ID, kind: 'input' })
hub.start()

await client.submit(constructInputs.start('play', { running: false }))
await manager.submit(
  constructInputs.report({ construct: 'play', status: 'running', link: 'ws://127.0.0.1:41377/link' }),
)
await client.submit(constructInputs.send('play', { type: 'time/set-running', payload: { running: true } }))
await client.submit(constructInputs.stop('play'))
```

## The changes of a product model

`productChanges(before, after, storeId?)` returns the inputs that change a store from the model `before` to the model `after`. The default `storeId` is `store`.

- Equal models give no input.
- When only field values differ, the result has, for each component in the order of the entities and the components, one `<storeId>/set-field` for each changed value and then one `<storeId>/clear-field` for each removed value.
- A running product construct keeps its live values after a `set-field` or a `clear-field`.
- Each other change, such as a removed component, gives one `<storeId>/replace-model` with `after`.

```ts
import { productChanges } from '@thrashplay/wishem-construct-manager'

const inputs = productChanges(before, after, 'product')
```

## The construct manager

`attachConstructManager({ hub, behaviors, log })` is in the entry `node`. It reads the construct list of the workbench hub `hub` and starts or stops one product construct for each entry that wants `running`. The list `behaviors` holds the native behaviors of the product, and each product construct runs them. The hub must have the parts `product` and `constructs`.

```ts
import { fileURLToPath } from 'node:url'
import { createStore } from '@thrashplay/wishem-core'
import type { Model } from '@thrashplay/wishem-core'
import { readModelFolder } from '@thrashplay/wishem-host-nodejs'
import { createHub } from '@thrashplay/wishem-hub'
import { behaviors } from '@thrashplay/wishem-sample-product'
import { constructInputs, createConstructList } from '@thrashplay/wishem-construct-manager'
import type { ConstructList } from '@thrashplay/wishem-construct-manager'
import { attachConstructManager } from '@thrashplay/wishem-construct-manager/node'

const eventually = async (check: () => boolean) => {
  while (!check()) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

const folder = fileURLToPath(new URL('../../sample-product/model', import.meta.url))
const model = (await readModelFolder(folder)).data as Model
const hub = createHub({
  subsystems: [createStore(), createStore({ id: 'product', model }), createConstructList()],
})
hub.start()
const manager = attachConstructManager({ hub, behaviors, log: (line) => console.log(line) })
const client = hub.attach({ id: 'client', kind: 'input' })
const entry = () => (hub.read().constructs as ConstructList).constructs.play

await client.submit(constructInputs.start('play'))
await eventually(() => entry().status === 'running')
await client.submit(constructInputs.send('play', { type: 'time/set-running', payload: { running: false } }))
await eventually(() => entry().time === 'paused')
await client.submit(constructInputs.stop('play'))
await eventually(() => entry().status === 'stopped')
await manager.close()
hub.stop()
```

The construct manager attaches the input port `construct-manager` and the output port `construct-manager-reader` to `hub`. It also attaches the same two ports to the hub of each product construct. `attachConstructManager` throws when `hub` uses one of these IDs.

A product construct (`startProductConstruct`) holds:

- a hub with the parts `time` and `store`, and the update subsystem, which runs the `behaviors`. The part `time` holds `stepMs`, the step length of the clock (default 50 milliseconds)
- a link server on the port of the option `port` (`linkUrl`, for example `ws://127.0.0.1:41377/link`). The default is 0: the system selects a free port. A port in use rejects `startProductConstruct` with `EADDRINUSE`, and then no timer and no open port stay.
- a clock on the port `clock`

Only the source `construct-manager` can rewind the hub of a product construct. The construct manager rewinds it when a client sends the input `hub/rewind` with `constructs/send`.

### Step back

The input `constructs/rewind` has the payload `{ construct, ticks }`. The construct manager keeps a history of the ticks of each live product construct. It rewinds the product construct to the state before the tick that is `ticks` ticks back. When the history is shorter, it rewinds to the state before the first tick. An empty history gives the result `invalid` with the problem `The construct has no tick to step back.` at `payload.ticks`. The result is the `lastSend` of the entry, under the sequence number of the `constructs/rewind`.

A step back keeps the `running` value that the product construct had before it. It keeps the changes of the product model that the construct manager sent after the target. The construct manager sends the rewind and these inputs in one turn, so no tick comes between them. A rewind or a replay of the workbench does not step the construct back again.

```ts
await client.submit(constructInputs.rewind({ construct: 'play', ticks: 1 }))
```

The construct manager gives each product construct the changes of the model `product` as inputs. It reports `running`, `stopped`, or `failed` for each construct with `constructs/report`. A `failed` construct stays `failed` until a client sends `constructs/stop` and then `constructs/start`.

A `constructs/stop` and a `constructs/start` always give a new product construct: a new link address and a time that starts from 0. This is also true when the hub applies both inputs in one pass.

The construct manager writes these log lines:

- `wishem: construct <id> runs, link at <link>`
- `wishem: construct <id> stopped`
- `wishem: construct <id> failed: <message>`
- `wishem: construct <id>: the change of the product was refused: <message>`

## The product construct process

`childProcessLauncher(options)` starts one product construct in a product construct process. This is a child process that runs `dist/product-construct-process.js`. The launcher gives a `LaunchedConstruct`: the link address (`linkUrl`), the process ID (`pid`), the ports `input` and `reader`, the promise `ended`, and `close()`.

The order of the start:

1. The launcher forks the process and sends `start`. The child loads the product code (`productCode`, a file URL), checks it, makes the hub, and starts the hub.
2. The child answers `ready`. The launcher opens a link on the IPC channel with the IDs `construct-manager` (input) and `construct-manager-reader` (output).
3. The launcher sends `serve`. The child serves the WebSocket link on a port that the system selects, starts the clock, and answers `serving` with the address.

The manager holds both IDs before any WebSocket client can connect. A WebSocket client that asks for one of them gets `refused` with `id-in-use`. Only the source `construct-manager` can send `hub/rewind`. The texts of one turn go in one IPC message, so the hub queues the inputs of a step back before the next tick.

The launcher gives each line of the standard output and the standard error of the child to `onLine`. A start that fails rejects with the message of the child, and then no process stays.

`close()` sends `stop`. The child sends `stopping` on each WebSocket link, frees its port, and ends. The launcher sends `SIGKILL` after `stopMs` (default 2000). Each call gives the same promise.

The child ends when its IPC channel disconnects. This happens when the parent ends for any cause, also `SIGKILL`. `ended` resolves with a message when the child ends and no `close()` was called.

### The faults of a product construct process

Each fault gives `ended` a message, and the manager reports `failed`. The launcher does not start the construct again.

| Fault                                                                                  | Result                                                                                                |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| The process ends                                                                       | `The process of the construct ended with the exit code <code>.` or `... with the signal <signal>.`    |
| No `serving` in `startMs` (default 10000)                                              | The launch rejects with `The construct did not start in <n> seconds.` The launcher kills the process. |
| No `pong` in `answerMs` (default 5000) after a ping, sent each `pingMs` (default 1000) | `ended` resolves with `The construct did not answer in <n> seconds.` The launcher kills the process.  |
| No result of a `submit` in `answerMs`                                                  | The `submit` of `input` rejects with the same message. The launcher kills the process.                |
| The process does not end in `stopMs` after `close()`                                   | The launcher sends `SIGKILL`.                                                                         |

A new process loads the current product code file. A running construct keeps the code that it loaded.

## The check of the product code

`checkProductCode(url, { answerMs })` imports the product code in a short child process and checks the behaviors. It never rejects. It gives `{ ok: true, count }`, or `{ ok: false, reason, message }`. `reason` is `load` (the import failed, or the check did not end in `answerMs`, default 5000) or `behaviors` (the message of `checkBehaviors`). The process ends in each case.

`inProcessLauncher(options)` runs the construct in this process with `startProductConstruct`, for tests with a fake clock. Its `LaunchedConstruct` also has `hub`.
