import { describe, expect, it } from 'vitest'

import { NAMESPACE, PACK_NAME, PRESET_NAMES, PRESETS } from './registry.js'

describe('the preset registry', () => {
  it('gives every preset an identifier of <namespace>:<preset>', () => {
    for (const preset of Object.values(PRESETS)) {
      expect(preset.entityId).toBe(`${NAMESPACE}:${preset.preset}`)
    }
  })

  it('keys every preset by its own name', () => {
    for (const [key, preset] of Object.entries(PRESETS)) {
      expect(preset.preset).toBe(key)
    }
  })

  it('lists the same names PRESETS holds', () => {
    expect([...PRESET_NAMES].sort()).toEqual(Object.keys(PRESETS).sort())
  })

  it('gives every preset a non-empty default name', () => {
    for (const preset of Object.values(PRESETS)) {
      expect(preset.defaultName).not.toBe('')
    }
  })

  it('offers the wizard preset as rpg:wizard', () => {
    expect(PRESETS.wizard.entityId).toBe('rpg:wizard')
  })

  it('names the pack that supplies the definitions', () => {
    expect(PACK_NAME).not.toBe('')
  })
})
