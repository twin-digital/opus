import { validateModel } from '@thrashplay/wishem-core'
import { describe, expect, it } from 'vitest'
import color from '../model/definitions/ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512.json' with { type: 'json' }
import counter from '../model/definitions/ct_6af38bd9-a91d-49d9-9370-fa4e6c04769d.json' with { type: 'json' }
import state from '../model/state.json' with { type: 'json' }
import { COLOR_FIELD, COLOR_TYPE, COUNTER_TYPE, COUNT_FIELD, SAMPLE_ENTITY } from './ids.js'

const result = validateModel({ definitions: [color, counter], entities: state.entities })

describe('the model folder', () => {
  it('is correct and has no warning', () => {
    expect(result).toMatchObject({ ok: true, warnings: [] })
  })

  it('has the labels Color and Counter', () => {
    expect([color.label, counter.label]).toEqual(['Color', 'Counter'])
  })

  it('has one entity with the first color and count', () => {
    expect(state.entities).toHaveLength(1)
    expect(state.entities[0]?.components).toEqual({
      [COLOR_TYPE]: { [COLOR_FIELD]: '#1d4ed8' },
      [COUNTER_TYPE]: { [COUNT_FIELD]: '0' },
    })
  })
})

describe('the IDs', () => {
  it('equal the IDs in the files', () => {
    expect(color.id).toBe(COLOR_TYPE)
    expect(color.fields.map((field) => field.id)).toEqual([COLOR_FIELD])
    expect(counter.id).toBe(COUNTER_TYPE)
    expect(counter.fields.map((field) => field.id)).toEqual([COUNT_FIELD])
    expect(state.entities[0]?.id).toBe(SAMPLE_ENTITY)
  })
})
