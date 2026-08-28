import { describe, expect, it } from 'vitest'

import { UnknownReferenceValueError } from './errors.js'
import { injuryStatusFromEspn, injuryStatusFromSleeper } from './injury-status.js'

describe('injuryStatusFromSleeper', () => {
  it('maps null/empty to ACTIVE', () => {
    expect(injuryStatusFromSleeper(null)).toBe('ACTIVE')
    expect(injuryStatusFromSleeper('')).toBe('ACTIVE')
  })

  it('maps the documented statuses', () => {
    expect(injuryStatusFromSleeper('Questionable')).toBe('QUESTIONABLE')
    expect(injuryStatusFromSleeper('Sus')).toBe('SUSPENDED')
    expect(injuryStatusFromSleeper('PUP')).toBe('PUP')
    expect(injuryStatusFromSleeper('NA')).toBe('UNKNOWN')
    expect(injuryStatusFromSleeper('COV')).toBe('UNKNOWN')
  })

  it('throws on unknown values', () => {
    expect(() => injuryStatusFromSleeper('Probable')).toThrow(UnknownReferenceValueError)
  })
})

describe('injuryStatusFromEspn', () => {
  it('maps the documented statuses', () => {
    expect(injuryStatusFromEspn('ACTIVE')).toBe('ACTIVE')
    expect(injuryStatusFromEspn('INJURY_RESERVE')).toBe('IR')
    expect(injuryStatusFromEspn('DAY_TO_DAY')).toBe('QUESTIONABLE')
    expect(injuryStatusFromEspn('PHYSICALLY_UNABLE_TO_PERFORM')).toBe('PUP')
  })

  it('maps unknown values to UNKNOWN and reports them', () => {
    const seen: string[] = []
    expect(injuryStatusFromEspn('FIFTEEN_DAY_IL', (v) => seen.push(v))).toBe('UNKNOWN')
    expect(seen).toEqual(['FIFTEEN_DAY_IL'])
  })
})
