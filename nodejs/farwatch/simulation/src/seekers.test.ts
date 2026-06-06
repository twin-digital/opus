import { describe, it, expect } from 'vitest'

import { AFFINITY_WORDS, COMPETENCE_WORDS, RATING_MAX, RATING_MIN, skillFor, type Seeker } from './seekers.js'

describe('skillFor', () => {
  const seeker: Seeker = {
    id: 'sk-1',
    name: 'Wren',
    skills: { stealth: { affinity: 2, competence: 1 } },
  }

  it('returns the listed skill for a rated approach', () => {
    expect(skillFor(seeker, 'stealth')).toEqual({ affinity: 2, competence: 1 })
  })

  it('defaults any unrated approach to unremarkable (0/0)', () => {
    expect(skillFor(seeker, 'combat')).toEqual({ affinity: 0, competence: 0 })
  })
})

describe('rating word scales', () => {
  it('have one word per level, with 0 (unremarkable) at the middle', () => {
    const span = RATING_MAX - RATING_MIN + 1
    for (const words of [AFFINITY_WORDS, COMPETENCE_WORDS]) {
      expect(words).toHaveLength(span)
      expect(words[0 - RATING_MIN]).toBe(words[Math.floor(span / 2)]) // index of rating 0 is the middle
    }
  })
})
