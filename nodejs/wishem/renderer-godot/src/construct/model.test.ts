import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateModel } from '@thrashplay/wishem-core'
import { describe, expect, it } from 'vitest'
import {
  CLEAR_COLOR_TYPE,
  COLORS,
  COLOR_FIELD,
  CONSTRUCT_MODEL,
  DEFAULT_PORT,
  SCREEN_ENTITY,
  STEP_MS,
} from './model.js'

describe('CONSTRUCT_MODEL', () => {
  it('is a correct model', () => {
    expect(validateModel(CONSTRUCT_MODEL)).toMatchObject({ ok: true })
  })

  it('has one component type "Clear color" with one field "Color" of the type string', () => {
    expect(CONSTRUCT_MODEL.definitions).toEqual([
      { id: CLEAR_COLOR_TYPE, label: 'Clear color', fields: [{ id: COLOR_FIELD, label: 'Color', type: 'string' }] },
    ])
  })

  it('has one entity whose color is the first color', () => {
    expect(CONSTRUCT_MODEL.entities).toEqual([
      { id: SCREEN_ENTITY, components: { [CLEAR_COLOR_TYPE]: { [COLOR_FIELD]: COLORS[0] } } },
    ])
  })

  it('uses IDs with a prefix and a lowercase UUID', () => {
    expect(CLEAR_COLOR_TYPE).toMatch(/^ct_[0-9a-f-]{36}$/)
    expect(COLOR_FIELD).toMatch(/^fld_[0-9a-f-]{36}$/)
    expect(SCREEN_ENTITY).toMatch(/^e_[0-9a-f-]{36}$/)
  })
})

describe('the constants', () => {
  it('holds four different colors in order', () => {
    expect(COLORS).toEqual(['#1d4ed8', '#b91c1c', '#15803d', '#a16207'])
    expect(new Set(COLORS).size).toBe(4)
  })

  it('uses the ID of the component type of the view ClearColor', () => {
    expect(CLEAR_COLOR_TYPE).toBe('ct_c47a0a86-b82f-43a8-8b0b-31a1e4ef6f37')
    const sidecar = JSON.parse(
      readFileSync(join(import.meta.dirname, '../../godot/views/ClearColor.view.json'), 'utf8'),
    ) as { componentType: string }
    expect(sidecar.componentType).toBe(CLEAR_COLOR_TYPE)
  })

  it('sets the default port to 4749', () => {
    expect(DEFAULT_PORT).toBe(4749)
  })

  it('sets the step of the clock to 500 milliseconds', () => {
    expect(STEP_MS).toBe(500)
  })
})
