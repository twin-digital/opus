import { expect, it } from 'vitest'
// The README example imports from '@thrashplay/wishem-update'.
import { createStore, type Model } from '@thrashplay/wishem-core'
import { createTime, timeInputs } from '@thrashplay/wishem-clock'
import { createHub } from '@thrashplay/wishem-hub'
import { checkBehaviors, createUpdate, type NativeBehavior } from './index.js'

const COUNTER = 'ct_11111111-1111-4111-8111-111111111111'
const COUNT = 'fld_11111111-1111-4111-8111-111111111111'

it('runs the example of the README', async () => {
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

  expect((hub.read().store as Model).entities[0]?.components[COUNTER]).toEqual({ [COUNT]: 2 })
})
