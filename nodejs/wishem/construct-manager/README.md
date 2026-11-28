# @thrashplay/wishem-construct-manager

The construct manager of the Wishem workbench. This package holds the construct list and the function that turns a change of a product model into inputs.

The package is private. The root entry uses no Node.js API. The entry `node` (`@thrashplay/wishem-construct-manager/node`) holds the construct manager, which starts and feeds the product constructs.

## The construct list

`createConstructList()` makes the model subsystem with the ID `constructs`. Its first part is `{ constructs: {} }`. Each entry of `constructs` is under the ID of a construct, and holds:

- `want`: `running` or `stopped`. The wanted state.
- `startTime`: `running` or `paused`. The time state when the construct starts.
- `status`: `pending`, `running`, `stopped`, or `failed`. What the construct manager reported last.
- `link`, `time`: only with the status `running`.
- `message`, `lastSend`: optional.

The ID of a construct has the form of the ID of a subsystem, for example `play`. The list has four inputs. `constructInputs` makes them. An input that changes nothing returns the same part. The list refuses each input that is not correct with the reason `invalid` and a problem with a path.

| Input               | Effect                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `constructs/start`  | Sets `want` to `running`. A new or stopped entry gets the status `pending`.                                                 |
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
