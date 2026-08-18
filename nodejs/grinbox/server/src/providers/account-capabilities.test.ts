import { accountCapabilitiesSchema, accountSupports, capabilityAbsenceReason } from '@grinbox/shared'
import { describe, expect, it } from 'vitest'
import { allCapabilities, capabilitiesFrom, parseCapabilities, serializeCapabilities } from './account-capabilities.js'

describe('the stored capability declaration (d-bzw8qoiy)', () => {
  it('is one shared can read back, with every capability in exactly one member', () => {
    const declared = capabilitiesFrom(['apply_category'], { archive: 'no safe move' }, 900)

    expect(accountCapabilitiesSchema.safeParse(declared).success).toBe(true)
    expect(declared.supported).toEqual(['apply_category'])
    expect(Object.keys(declared.unsupported).sort()).toEqual(['archive', 'file', 'send_message'])
    expect(declared.read_at).toBe(900)
  })

  it('round-trips through the stored column', () => {
    const declared = capabilitiesFrom(['file'], { apply_category: 'no keywords' }, 42)
    expect(parseCapabilities(serializeCapabilities(declared))).toEqual(declared)
  })

  it('reads a null, malformed, or unrecognisable column as no declaration', () => {
    expect(parseCapabilities(null)).toBeNull()
    expect(parseCapabilities('{')).toBeNull()
    expect(parseCapabilities(JSON.stringify({ supported: 'all' }))).toBeNull()
  })

  it("answers shared's readers", () => {
    const declared = capabilitiesFrom(['archive'], { file: 'no safe move' }, 0)
    expect(accountSupports(declared, 'archive')).toBe(true)
    expect(accountSupports(declared, 'file')).toBe(false)
    expect(capabilityAbsenceReason(declared, 'file')).toBe('no safe move')
    expect(capabilityAbsenceReason(declared, 'archive')).toBeNull()
    // Nothing declared is nothing to explain.
    expect(capabilityAbsenceReason(null, 'file')).toBeNull()
  })

  it('explains nothing for a backend that carries everything', () => {
    expect(allCapabilities(7)).toEqual({
      supported: ['apply_category', 'archive', 'file', 'send_message'],
      unsupported: {},
      read_at: 7,
    })
  })
})
