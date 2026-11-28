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

The ID of a construct has the form of the ID of a subsystem, for example `play`. The list has four inputs. `constructInputs` makes them. An input that changes nothing returns the same part. The list refuses each input that is not correct with the reason `invalid` and a problem with a path.

| Input               | Effect                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `constructs/start`  | Sets `want` to `running`. A new or stopped entry gets the status `pending` and the `startSeq` of the input.                 |
| `constructs/stop`   | Sets `want` to `stopped`. The entry stays. The construct must be in the list.                                               |
| `constructs/send`   | Changes no part. The construct must be wanted to run and have the status `running`.                                         |
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
- When only field values differ, the result has one `<storeId>/set-field` for each changed value, in the order of the entities, the components, and the fields.
- Each other change gives one `<storeId>/replace-model` with `after`.

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

- a hub with the parts `time` and `store`, and the update subsystem, which runs the `behaviors`
- a link server on a port that the system selects (`linkUrl`, for example `ws://127.0.0.1:41377/link`)
- a clock on the port `clock`

Only the source `construct-manager` can rewind the hub of a product construct. The construct manager rewinds it when a client sends the input `hub/rewind` with `constructs/send`.

The construct manager gives each product construct the changes of the model `product` as inputs. It reports `running`, `stopped`, or `failed` for each construct with `constructs/report`. A `failed` construct stays `failed` until a client sends `constructs/stop` and then `constructs/start`.

A `constructs/stop` and a `constructs/start` always give a new product construct: a new link address and a time that starts from 0. This is also true when the hub applies both inputs in one pass.

The construct manager writes these log lines:

- `wishem: construct <id> runs, link at <link>`
- `wishem: construct <id> stopped`
- `wishem: construct <id> failed: <message>`
- `wishem: construct <id>: the change of the product was refused: <message>`
