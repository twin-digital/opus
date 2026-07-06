import { describe, it, expect } from 'vitest'

import { createRng } from '@thrashplay/fw-core'

import { APPROACHES } from './approaches.js'
import {
  AFFINITY_WORDS,
  COMPETENCE_WORDS,
  generateRoster,
  leadFor,
  pickParty,
  RATING_MAX,
  RATING_MIN,
  roster,
  ROSTER_SIZE,
  skillFor,
  type Seeker,
} from './seekers.js'

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

describe('generateRoster', () => {
  it('builds the requested number of seekers with distinct names and ids', () => {
    const cast = generateRoster(createRng(1), ROSTER_SIZE)
    expect(cast).toHaveLength(ROSTER_SIZE)
    expect(new Set(cast.map((s) => s.name)).size).toBe(ROSTER_SIZE)
    expect(new Set(cast.map((s) => s.id)).size).toBe(ROSTER_SIZE)
  })

  it('carries each seeker the permanent record’s appearance and temperament', () => {
    for (const seeker of generateRoster(createRng(5), ROSTER_SIZE)) {
      expect(seeker.appearance?.length).toBeGreaterThan(0)
      expect(seeker.temperament?.length).toBeGreaterThan(0)
    }
  })

  it('gives each seeker a sparse profile of standout skills, in range and never 0/0', () => {
    for (const seeker of generateRoster(createRng(3), ROSTER_SIZE)) {
      const rated = Object.entries(seeker.skills)
      expect(rated.length).toBeGreaterThanOrEqual(1)
      expect(rated.length).toBeLessThan(APPROACHES.length)
      for (const [approach, skill] of rated) {
        expect(APPROACHES).toContain(approach)
        expect(skill.affinity === 0 && skill.competence === 0).toBe(false)
        for (const level of [skill.affinity, skill.competence]) {
          expect(level).toBeGreaterThanOrEqual(RATING_MIN)
          expect(level).toBeLessThanOrEqual(RATING_MAX)
        }
      }
    }
  })
})

describe('roster', () => {
  it('is the same fixed cast every call (so they recur across chronicles)', () => {
    expect(roster()).toEqual(roster())
    expect(roster()).toHaveLength(ROSTER_SIZE)
  })
})

describe('leadFor', () => {
  const keen: Seeker = { id: 'keen', name: 'Keen', skills: { stealth: { affinity: 2, competence: 0 } } }
  const adept: Seeker = { id: 'adept', name: 'Adept', skills: { stealth: { affinity: 1, competence: 2 } } }
  const plain: Seeker = { id: 'plain', name: 'Plain', skills: {} }

  it('picks the highest affinity for the approach (rng irrelevant when one stands out)', () => {
    expect(leadFor(createRng(0), [plain, adept, keen], 'stealth').id).toBe('keen')
    expect(leadFor(createRng(99), [plain, adept, keen], 'stealth').id).toBe('keen')
  })

  it('breaks an affinity tie by competence (the most able is pressed in)', () => {
    const eager: Seeker = { id: 'eager', name: 'Eager', skills: { stealth: { affinity: 1, competence: -1 } } }
    expect(leadFor(createRng(3), [eager, adept], 'stealth').id).toBe('adept')
  })

  it('spreads the lead across the party when no one is notable at the approach', () => {
    const led = new Set<string>()
    for (let seed = 0; seed < 50; seed++) {
      led.add(leadFor(createRng(seed), [plain, keen, adept], 'combat').id) // all 0/0 at combat
    }
    expect(led.size).toBeGreaterThan(1) // not always the same member
  })
})

describe('pickParty', () => {
  it('pulls a distinct subset of 3–5 from the roster', () => {
    const pool = roster()
    for (let seed = 0; seed < 100; seed++) {
      const party = pickParty(createRng(seed), pool)
      expect(party.length).toBeGreaterThanOrEqual(3)
      expect(party.length).toBeLessThanOrEqual(5)
      expect(new Set(party.map((s: Seeker) => s.id)).size).toBe(party.length)
      for (const member of party) {
        expect(pool).toContain(member)
      }
    }
  })
})
