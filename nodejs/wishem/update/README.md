# @thrashplay/wishem-update

The update subsystem of a Wishem construct. It runs the native behaviors of a product in each tick. The package uses no Node.js API. The command `pnpm build --filter @thrashplay/wishem-update` fails when a source file uses a Node.js module or global.

## The update subsystem

`createUpdate({ store, behaviors })` wraps one store. The result is a model subsystem with the ID and the first part of the store. It applies each input type of the store as the store does. It also applies `time/advance`. A construct has one update subsystem. Put the `time` subsystem of `@thrashplay/wishem-clock` before it in the list of subsystems.

`checkBehaviors(value)` returns the list, or throws a `TypeError` that names the position or the ID of the first problem. `createUpdate` calls it. A `start` script can call it to check product code before a construct starts.

## A native behavior

A native behavior has three members:

- `id`: text that is not empty, and unique in one list. Use the form `<package>/<name>`.
- `componentType`: the ID of one component type.
- `update(fields, tick)`: a pure function. It gets the fields of one component and the tick. It returns the new fields, or the same object.

The tick holds `ms` (the length of the tick), and `ticks` and `now` of the part `time` after the tick.

The update subsystem writes each field of the result whose value differs from the current value. A field that the result does not hold keeps its value. Each write goes through the store, so the store checks each value.

## The order

In each tick, the update subsystem runs the behaviors in the order of the list. For each behavior, it runs the behavior for each entity that has the component type, in the order of the entities in the store. Each run gets the fields after the writes of the runs before it in the same tick.

When no behavior changes a field, the update subsystem returns the same part object.

## The refusal of a tick

The update subsystem refuses the tick in these cases:

- A behavior throws an error.
- The store refuses a value that a behavior returns.
- The joined state has no part `time` with the numbers `ticks` and `now`.

The hub then refuses the input with the reason `invalid`, and no part changes. Each problem names the behavior and the entity: its message starts with `The behavior "<id>" for the entity "<entity>": `, and its path starts with `['behaviors', <id>, <entity>]`.

## Example

```ts
import { createStore, type Model } from '@thrashplay/wishem-core'
import { createTime, timeInputs } from '@thrashplay/wishem-clock'
import { createHub } from '@thrashplay/wishem-hub'
import { checkBehaviors, createUpdate, type NativeBehavior } from '@thrashplay/wishem-update'

const COUNTER = 'ct_11111111-1111-4111-8111-111111111111'
const COUNT = 'fld_11111111-1111-4111-8111-111111111111'

const model: Model = {
  definitions: [{ id: COUNTER, label: 'Counter', fields: [{ id: COUNT, label: 'count', type: 'number' }] }],
  entities: [{ id: 'e_11111111-1111-4111-8111-111111111111', components: { [COUNTER]: { [COUNT]: 0 } } }],
}

const count: NativeBehavior = {
  id: 'example/count',
  componentType: COUNTER,
  update: (fields) => ({ ...fields, [COUNT]: (fields[COUNT] as number) + 1 }),
}

const update = createUpdate({ store: createStore({ model }), behaviors: checkBehaviors([count]) })
const hub = createHub({ subsystems: [createTime(), update] }) // `time` comes first.
const controls = hub.attach({ id: 'controls', kind: 'input' })
hub.start()

await controls.submit(timeInputs.advance(50))
await controls.submit(timeInputs.advance(50))
// The count is 2.
```
