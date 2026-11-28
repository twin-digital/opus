import type { Model } from '@thrashplay/wishem-core'
import { expect, it } from 'vitest'
// The README example imports from the packages of Wishem.
import { createStore } from '@thrashplay/wishem-core'
import { createHub } from '@thrashplay/wishem-hub'
import { createTime, timeInputs } from '@thrashplay/wishem-clock'
import color from '../model/definitions/ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512.json' with { type: 'json' }
import counter from '../model/definitions/ct_6af38bd9-a91d-49d9-9370-fa4e6c04769d.json' with { type: 'json' }
import state from '../model/state.json' with { type: 'json' }
import { COUNTER_TYPE, COUNT_FIELD, SAMPLE_ENTITY, withCountRule } from './index.js'

const model = { definitions: [color, counter], entities: state.entities }

it('runs the example of the README', async () => {
  const hub = createHub({ subsystems: [createTime(), withCountRule(createStore({ model }))] })
  hub.start()
  const controls = hub.attach({ id: 'controls', kind: 'input' })
  await controls.submit(timeInputs.advance(100))

  const entity = (hub.read().store as Model).entities.find((e) => e.id === SAMPLE_ENTITY)
  expect(entity?.components[COUNTER_TYPE]?.[COUNT_FIELD]).toBe('1')
})
