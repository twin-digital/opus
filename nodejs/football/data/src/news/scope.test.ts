import { describe, expect, it } from 'vitest'

import { mintPlayerId } from '../ids.js'
import type { MarketData, Player } from '../models.js'
import { selectNewsworthyPool } from './scope.js'

const player = (overrides: Partial<Player> = {}): Player => ({
  id: mintPlayerId(),
  name: 'Fixture Player',
  position: 'RB',
  team: 'DET',
  byeWeek: 8,
  age: 24.4,
  yearsExp: 3,
  injuryStatus: 'ACTIVE',
  ...overrides,
})

const market = (playerId: Player['id'], overrides: Partial<MarketData> = {}): MarketData => ({
  playerId,
  adp: {},
  ecr: null,
  percentRostered: null,
  asOf: 'now',
  ...overrides,
})

const ecr = (rank: number): MarketData['ecr'] => ({ rank, posRank: 'RB1', tier: 1, best: 1, worst: 9, stdDev: 1 })

describe('selectNewsworthyPool', () => {
  it('includes players with any real ADP at or under 170', () => {
    const inside = player({ name: 'Inside' })
    const boundary = player({ name: 'Boundary' })
    const outside = player({ name: 'Outside' })
    const pool = selectNewsworthyPool(
      [inside, boundary, outside],
      [
        market(inside.id, { adp: { sleeper: { ppr: 350 }, fantasypros: { half: 12.5 } } }),
        market(boundary.id, { adp: { sleeper: { half: 170 } } }),
        market(outside.id, { adp: { sleeper: { ppr: 170.1 } } }),
      ],
    )
    expect(pool.map((p) => p.name).sort()).toEqual(['Boundary', 'Inside'])
  })

  it('ignores ESPN ADP values on the undrafted plateau (>= 169)', () => {
    const plateau = player({ name: 'Plateau' })
    const real = player({ name: 'Real' })
    const pool = selectNewsworthyPool(
      [plateau, real],
      [market(plateau.id, { adp: { espn: { ppr: 169.99 } } }), market(real.id, { adp: { espn: { ppr: 168.9 } } })],
    )
    expect(pool.map((p) => p.name)).toEqual(['Real'])
  })

  it('includes players ranked inside ECR 200', () => {
    const ranked = player({ name: 'Ranked' })
    const unranked = player({ name: 'Unranked' })
    const pool = selectNewsworthyPool(
      [ranked, unranked],
      [market(ranked.id, { ecr: ecr(200) }), market(unranked.id, { ecr: ecr(201) })],
    )
    expect(pool.map((p) => p.name)).toEqual(['Ranked'])
  })

  it('extends to ECR 300 only for injury-flagged players', () => {
    const injured = player({ name: 'Injured', injuryStatus: 'IR' })
    const healthy = player({ name: 'Healthy' })
    const injuredDeep = player({ name: 'InjuredDeep', injuryStatus: 'OUT' })
    const injuredUnranked = player({ name: 'InjuredUnranked', injuryStatus: 'QUESTIONABLE' })
    const pool = selectNewsworthyPool(
      [injured, healthy, injuredDeep, injuredUnranked],
      [
        market(injured.id, { ecr: ecr(250) }),
        market(healthy.id, { ecr: ecr(250) }),
        market(injuredDeep.id, { ecr: ecr(301) }),
        market(injuredUnranked.id),
      ],
    )
    expect(pool.map((p) => p.name)).toEqual(['Injured'])
  })

  it('excludes players with no market row', () => {
    const nobody = player({ name: 'Nobody', injuryStatus: 'IR' })
    expect(selectNewsworthyPool([nobody], [])).toEqual([])
  })
})
