import { describe, expect, it } from 'vitest'
import type { ComponentTypeDefinition, Entity } from '@thrashplay/wishem-core'
import { COLOR_FIELD, COLOR_TYPE, COUNT_FIELD, COUNTER_TYPE, SAMPLE_ENTITY } from '@thrashplay/wishem-sample-product'
import { entityName, shortId } from './entity-name.js'

const definitions: ComponentTypeDefinition[] = [
  { id: COLOR_TYPE, label: 'Color', fields: [{ id: COLOR_FIELD, label: 'color', type: 'string' }] },
  { id: COUNTER_TYPE, label: 'Counter', fields: [{ id: COUNT_FIELD, label: 'count', type: 'number' }] },
]

const sample: Entity = {
  id: SAMPLE_ENTITY,
  components: { [COLOR_TYPE]: { [COLOR_FIELD]: '#1d4ed8' }, [COUNTER_TYPE]: { [COUNT_FIELD]: 0 } },
}

describe('entityName', () => {
  it('joins the labels of the component types with a comma and a space', () => {
    expect(entityName(sample, definitions)).toBe('Color, Counter')
  })

  it('uses the order of the definitions, not the order of the components', () => {
    const entity: Entity = {
      id: 'e_1',
      components: { [COUNTER_TYPE]: { [COUNT_FIELD]: 1 }, [COLOR_TYPE]: { [COLOR_FIELD]: 'x' } },
    }
    expect(entityName(entity, definitions)).toBe('Color, Counter')
    expect(entityName(entity, [...definitions].reverse())).toBe('Counter, Color')
  })

  it('names only the components that the entity has', () => {
    const entity: Entity = { id: 'e_1', components: { [COUNTER_TYPE]: {} } }
    expect(entityName(entity, definitions)).toBe('Counter')
  })

  it('is No components for an entity with no component', () => {
    expect(entityName({ id: 'e_1', components: {} }, definitions)).toBe('No components')
  })

  it('is No components when no definition matches', () => {
    expect(entityName(sample, [])).toBe('No components')
  })
})

describe('shortId', () => {
  it('is the first 10 characters of the ID', () => {
    expect(shortId(SAMPLE_ENTITY)).toBe('e_99969ed3')
  })

  it('keeps a short ID as it is', () => {
    expect(shortId('e_1')).toBe('e_1')
  })
})
