import { describe, it, expect } from 'vitest'

import type { NonfungibleKind } from '@thrashplay/fw-simulation'
import { makeAdventure, makeTrial } from '@thrashplay/fw-simulation/testing'

import { derivePalette } from './palette.js'

const adv = (kind: NonfungibleKind, approaches: string[]) =>
  makeAdventure({
    goal: { reward: { kind }, viable: true },
    trials: approaches.map((a) => makeTrial({ approach: a as never })),
  })

describe('derivePalette', () => {
  it('is deterministic for a given adventure', () => {
    const a = adv('item', ['combat', 'might'])
    expect(derivePalette(a)).toEqual(derivePalette(a))
  })

  it('draws biome / scale / inhabitants from the vocabulary', () => {
    const p = derivePalette(adv('item', ['stealth']))
    expect(p.biome.length).toBeGreaterThan(0)
    expect(p.scale.length).toBeGreaterThan(0)
    expect(p.inhabitants.length).toBeGreaterThan(0)
  })

  it('derives the adventure type from the goal and the dominant approach', () => {
    expect(derivePalette(adv('secret', ['combat', 'might'])).adventureType).toMatch(/mystery/) // knowledge goal wins
    expect(derivePalette(adv('item', ['combat', 'might', 'intimidation'])).adventureType).toMatch(/raid/) // force
    expect(derivePalette(adv('item', ['stealth', 'cunning', 'deception'])).adventureType).toMatch(/heist/) // guile
    expect(derivePalette(adv('item', ['diplomacy', 'charm', 'performance'])).adventureType).toMatch(/negotiation/) // social
    expect(derivePalette(adv('item', ['endurance', 'resolve', 'speed'])).adventureType).toMatch(/expedition/) // grit
  })
})
