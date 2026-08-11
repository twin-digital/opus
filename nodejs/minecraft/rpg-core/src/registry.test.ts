import { readFileSync } from 'node:fs'

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

  it('agrees with the major the package version claims: bare token at 1, the major carried after', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string
    }
    const major = Number(manifest.version.split('.')[0])
    expect(major).toBeGreaterThanOrEqual(1)
    expect(NAMESPACE).toBe(major === 1 ? 'rpg' : `rpg${major}`)
  })
})
