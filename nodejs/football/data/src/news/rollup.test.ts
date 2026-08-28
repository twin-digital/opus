import { describe, expect, it } from 'vitest'

import { rollupAssessments } from './rollup.js'

describe('rollupAssessments', () => {
  it('returns null with nothing assessed', () => {
    expect(rollupAssessments([])).toBeNull()
  })

  it('an unclear roundup published later never buries a directional injury note', () => {
    // The Evans/McMillan case: buzz roundup lands 14h after two harms items.
    expect(
      rollupAssessments([
        { direction: 'unclear', impact: 'low', published: '2026-08-27T14:00:00Z' },
        { direction: 'harms', impact: 'med', published: '2026-08-27T00:00:00Z' },
        { direction: 'harms', impact: 'med', published: '2026-08-26T00:00:00Z' },
      ]),
    ).toEqual({ direction: 'harms', impact: 'med' })
  })

  it('a newer directional item flips the dot (the Judkins improves case)', () => {
    expect(
      rollupAssessments([
        { direction: 'harms', impact: 'med', published: '2026-08-20T00:00:00Z' },
        { direction: 'improves', impact: 'med', published: '2026-08-26T00:00:00Z' },
      ]),
    ).toEqual({ direction: 'improves', impact: 'med' })
  })

  it('a fresher low-impact status row does not downgrade a recent high (the Kamara case)', () => {
    expect(
      rollupAssessments([
        { direction: 'harms', impact: 'med', published: '2026-08-28T00:00:00Z' },
        { direction: 'harms', impact: 'high', published: '2026-08-24T00:00:00Z' },
      ]),
    ).toEqual({ direction: 'harms', impact: 'high' })
  })

  it('impact escalation stops at 14 days: a stale high no longer bumps a fresh low', () => {
    expect(
      rollupAssessments([
        { direction: 'harms', impact: 'low', published: '2026-08-28T00:00:00Z' },
        { direction: 'harms', impact: 'high', published: '2026-08-01T00:00:00Z' },
      ]),
    ).toEqual({ direction: 'harms', impact: 'low' })
  })

  it('all-unclear stays an unclear dot', () => {
    expect(
      rollupAssessments([
        { direction: 'unclear', impact: 'low', published: '2026-08-27T00:00:00Z' },
        { direction: 'unclear', impact: 'med', published: '2026-08-26T00:00:00Z' },
      ]),
    ).toEqual({ direction: 'unclear', impact: 'med' })
  })

  it('an undated item of the winning direction counts toward impact but not the lead', () => {
    expect(
      rollupAssessments([
        { direction: 'harms', impact: 'low', published: '2026-08-28T00:00:00Z' },
        { direction: 'harms', impact: 'high', published: null },
      ]),
    ).toEqual({ direction: 'harms', impact: 'high' })
  })
})
