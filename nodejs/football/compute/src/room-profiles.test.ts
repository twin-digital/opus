import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Player, PlayerId, Position } from '@twin-digital/football-data'
import { describe, expect, it } from 'vitest'

import {
  argmaxTake,
  loadRoomRulesFile,
  pickThreats,
  resolveRoomRules,
  takeDistribution,
  takeProbability,
  teamAtPick,
  type RoomProfiles,
  type TakeCandidate,
} from './room-profiles.js'
import { simulateRoomSegment, type RolloutPlayer } from './rollout.js'

const RULES_FILE = path.resolve(fileURLToPath(import.meta.url), '../../..', 'design', 'room-rules.json')

/** Every loyalty name the shipped rules file references. */
const LOYALTY_NAMES = [
  'DeVonta Smith',
  'Jayden Daniels',
  'Nico Collins',
  'DK Metcalf',
  'David Njoku',
  'Brock Purdy',
  'Jahmyr Gibbs',
  'Sam LaPorta',
  'Brian Robinson',
  "Ka'imi Fairbairn",
]

const namedPlayers = (names: string[]): Pick<Player, 'id' | 'name'>[] =>
  names.map((name, i) => ({ id: `p-${String(i + 1)}`, name }))

const candidate = (playerId: string, position: Position, roomAdp: number | null): TakeCandidate => ({
  playerId: playerId as PlayerId,
  position,
  roomAdp,
})

const rolloutPlayer = (playerId: string, position: Position, roomAdp: number | null): RolloutPlayer => ({
  playerId: playerId as PlayerId,
  name: playerId,
  position,
  points: null,
  roomAdp,
  vor: null,
  upsideScore: null,
})

const profilesFrom = (spec: unknown, players: Pick<Player, 'id' | 'name'>[] = []): RoomProfiles =>
  resolveRoomRules(spec, players)

describe('resolveRoomRules — validation and name resolution', () => {
  it('loads the shipped room-rules.json with zero warnings once every loyalty name resolves', () => {
    const profiles = loadRoomRulesFile(RULES_FILE, namedPlayers(LOYALTY_NAMES))
    expect(profiles.warnings).toEqual([])
    expect(profiles.teams.size).toBe(12)
    expect(profiles.defaults).toHaveLength(2)
    const ruleCount = [...profiles.teams.values()].reduce(
      (sum, team) => sum + team.posRules.length + team.loyalty.size,
      0,
    )
    expect(ruleCount).toBe(19)
    for (const team of profiles.teams.values()) {
      for (const rule of team.posRules) {
        expect(rule.evidence).not.toBeNull()
      }
      for (const rule of team.loyalty.values()) {
        expect(rule.evidence).not.toBeNull()
      }
    }
  })

  it('keeps team 5 at the base model except the 2024 Daniels loyalty (2025 was full autodraft)', () => {
    const profiles = loadRoomRulesFile(RULES_FILE, namedPlayers(LOYALTY_NAMES))
    const lehmer = profiles.teams.get(5)
    expect(lehmer?.sigma).toBeNull()
    expect(lehmer?.sigmaScale).toBe(1)
    expect(lehmer?.posRules).toEqual([])
    expect([...(lehmer?.loyalty.values() ?? [])].map((rule) => rule.playerName)).toEqual(['Jayden Daniels'])
    expect([...(lehmer?.loyalty.values() ?? [])][0]?.evidence).toContain("'24")
  })

  it('ships teams 13 and 14 as explicit base-model entries', () => {
    const profiles = loadRoomRulesFile(RULES_FILE, namedPlayers(LOYALTY_NAMES))
    for (const teamId of [13, 14]) {
      const team = profiles.teams.get(teamId)
      expect(team).toBeDefined()
      expect(team?.sigma).toBeNull()
      expect(team?.posRules).toEqual([])
      expect(team?.loyalty.size).toBe(0)
    }
  })

  it('warns and skips unresolvable or ambiguous loyalty names instead of throwing', () => {
    const players = [
      { id: 'p-1' as PlayerId, name: 'Jane Doe' },
      { id: 'p-2' as PlayerId, name: 'Twin Name' },
      { id: 'p-3' as PlayerId, name: 'Twin Name' },
    ]
    const warned: string[] = []
    const profiles = resolveRoomRules(
      {
        teams: {
          '1': {
            teamId: 1,
            sigma: null,
            rules: [
              { kind: 'loyalty', playerName: 'Nobody Real', strength: 3 },
              { kind: 'loyalty', playerName: 'Twin Name', strength: 3 },
              { kind: 'loyalty', playerName: 'jane doe', strength: 3 },
            ],
          },
        },
      },
      players,
      (message) => warned.push(message),
    )
    expect(warned).toHaveLength(2)
    expect(profiles.warnings).toEqual(warned)
    expect(warned[0]).toContain('Nobody Real')
    expect(warned[1]).toContain('ambiguous')
    // case-insensitive resolution still lands
    expect(profiles.teams.get(1)?.loyalty.get('p-1')?.playerName).toBe('jane doe')
  })

  it('throws on structural problems', () => {
    expect(() => profilesFrom([])).toThrow('teams')
    expect(() => profilesFrom({ teams: { x: { sigma: null, rules: [] } } })).toThrow('teamId')
    expect(() => profilesFrom({ teams: { '1': { sigma: -2, rules: [] } } })).toThrow('sigma')
    expect(() => profilesFrom({ teams: { '1': { sigma: null, sigmaScale: 0, rules: [] } } })).toThrow('sigmaScale')
    expect(() => profilesFrom({ teams: { '1': { sigma: null, rules: [{ kind: 'nope', position: 'QB' }] } } })).toThrow(
      'kind',
    )
    expect(() =>
      profilesFrom({
        teams: { '1': { sigma: null, rules: [{ kind: 'pos-boost', position: 'QB', rounds: [5, 4], strength: 2 }] } },
      }),
    ).toThrow('rounds')
    expect(() =>
      profilesFrom({
        teams: { '1': { sigma: null, rules: [{ kind: 'pos-boost', position: 'ZZ', rounds: [1, 2], strength: 2 }] } },
      }),
    ).toThrow('position')
    expect(() =>
      profilesFrom({
        teams: { '1': { sigma: null, rules: [{ kind: 'pos-boost', position: 'QB', rounds: [1, 2], strength: 0 }] } },
      }),
    ).toThrow('strength')
    expect(() => profilesFrom({ teams: { '1': { sigma: null, rules: [{ kind: 'loyalty', strength: 2 }] } } })).toThrow(
      'playerName',
    )
  })
})

describe('teamAtPick', () => {
  it('snakes through the pick order', () => {
    const order = [8, 1, 9, 11]
    expect([1, 2, 3, 4].map((pick) => teamAtPick(order, pick))).toEqual([8, 1, 9, 11])
    expect([5, 6, 7, 8].map((pick) => teamAtPick(order, pick))).toEqual([11, 9, 1, 8])
    expect(teamAtPick(order, 9)).toBe(8)
  })
})

describe('takeProbability', () => {
  const pool = [
    candidate('p-a', 'RB', 1),
    candidate('p-b', 'WR', 2),
    candidate('p-c', 'QB', 6),
    candidate('p-d', 'TE', 10),
    candidate('p-e', 'K', null),
  ]

  it('normalizes to a categorical distribution over the available pool', () => {
    for (const profiles of [null, profilesFrom({ teams: {} })]) {
      const distribution = takeDistribution(profiles, [1, 2], 1, pool)
      const total = [...distribution.values()].reduce((sum, p) => sum + p, 0)
      expect(total).toBeCloseTo(1, 9)
      for (const p of distribution.values()) {
        expect(p).toBeGreaterThanOrEqual(0)
        expect(p).toBeLessThanOrEqual(1)
      }
      expect(distribution.get('p-a') ?? 0).toBeGreaterThan(distribution.get('p-d') ?? 0)
    }
  })

  it('loyalty dominates near the loyal team’s pick', () => {
    const players = [{ id: 'p-d' as PlayerId, name: 'Loyal Guy' }]
    const profiles = profilesFrom(
      {
        teams: { '2': { teamId: 2, sigma: null, rules: [{ kind: 'loyalty', playerName: 'Loyal Guy', strength: 50 }] } },
      },
      players,
    )
    const nearPool = [candidate('p-x', 'RB', 7), candidate('p-d', 'TE', 10)]
    // pick 8 belongs to team 2 (order [1,2] snake: 1,2,2,1,1,2,2,1? no — [1,2]: picks 1..8 → 1,2,2,1,1,2,2,1)
    const loyalPick = 7
    expect(teamAtPick([1, 2], loyalPick)).toBe(2)
    expect(takeProbability(profiles, [1, 2], loyalPick, nearPool[1] as TakeCandidate, nearPool)).toBeGreaterThan(0.5)
    expect(argmaxTake(profiles, [1, 2], loyalPick, nearPool)?.playerId).toBe('p-d')
    // the other team is unmoved: base argmax stands
    const otherPick = 5
    expect(teamAtPick([1, 2], otherPick)).toBe(1)
    expect(argmaxTake(profiles, [1, 2], otherPick, nearPool)?.playerId).toBe('p-x')
  })

  it('pos-suppress lowers QB take probability in the covered rounds only', () => {
    const profiles = profilesFrom({
      teams: {
        '1': {
          teamId: 1,
          sigma: null,
          rules: [{ kind: 'pos-suppress', position: 'QB', rounds: [1, 2], strength: 0.1 }],
        },
      },
    })
    const qb = candidate('p-q', 'QB', 3)
    const rb = candidate('p-r', 'RB', 3.5)
    const qbPool = [qb, rb]
    // round 1 (pick 1, team 1): suppressed vs base
    const suppressed = takeProbability(profiles, [1, 2], 1, qb, qbPool)
    const base = takeProbability(null, [1, 2], 1, qb, qbPool)
    expect(suppressed).toBeLessThan(base * 0.5)
    // round 3 (pick 5, team 1): outside the rule — matches base
    expect(takeProbability(profiles, [1, 2], 5, qb, qbPool)).toBeCloseTo(
      takeProbability(null, [1, 2], 5, qb, qbPool),
      9,
    )
  })

  it('a team rule overrides the default for its position in its rounds', () => {
    const profiles = profilesFrom({
      defaults: { rules: [{ kind: 'pos-suppress', position: 'K', rounds: [1, 11], strength: 0.02 }] },
      teams: {
        '1': { teamId: 1, sigma: null, rules: [{ kind: 'pos-boost', position: 'K', rounds: [2, 3], strength: 2 }] },
        '2': { teamId: 2, sigma: null, rules: [] },
      },
    })
    const kicker = candidate('p-k', 'K', 5)
    const rb = candidate('p-r', 'RB', 5)
    const pool = [kicker, rb]
    // round 2 (pick 4 in a 2-team snake belongs to team 1): boost replaces the default
    expect(teamAtPick([1, 2], 4)).toBe(1)
    const boosted = takeProbability(profiles, [1, 2], 4, kicker, pool)
    // round 2 pick 3 belongs to team 2: default suppression applies
    const defaulted = takeProbability(profiles, [1, 2], 3, kicker, pool)
    expect(boosted).toBeGreaterThan(0.5)
    expect(defaulted).toBeLessThan(0.1)
  })

  it('sigmaScale spreads a team’s take distribution flatter', () => {
    const scaled = profilesFrom({ teams: { '1': { teamId: 1, sigma: null, sigmaScale: 2, rules: [] } } })
    const onTime = candidate('p-on', 'RB', 5)
    const later = candidate('p-late', 'WR', 12)
    const pool = [onTime, later]
    const flatOn = takeProbability(scaled, [1, 2], 5, onTime, pool)
    const baseOn = takeProbability(null, [1, 2], 5, onTime, pool)
    expect(flatOn).toBeLessThan(baseOn)
    expect(takeProbability(scaled, [1, 2], 5, later, pool)).toBeGreaterThan(
      takeProbability(null, [1, 2], 5, later, pool),
    )
  })
})

describe('pickThreats', () => {
  const players = [{ id: 'p-3' as PlayerId, name: 'Loyal Target' }]
  const rulesSpec = {
    teams: {
      '1': { teamId: 1, owner: 'Alpha', sigma: null, rules: [] },
      '2': {
        teamId: 2,
        owner: 'Bravo',
        sigma: null,
        rules: [{ kind: 'loyalty', playerName: 'Loyal Target', strength: 50 }],
        evidence: { '0': 'Drafted Loyal Target both years' },
      },
      '3': { teamId: 3, owner: 'Me', sigma: null, rules: [] },
    },
  }
  const pool = [
    candidate('p-1', 'RB', 1),
    candidate('p-2', 'WR', 2),
    candidate('p-3', 'TE', 10),
    candidate('p-4', 'RB', 12),
  ]

  it('levels, survival product, and attribution gating', () => {
    const profiles = profilesFrom(rulesSpec, players)
    const threats = pickThreats(profiles, [1, 2, 3], 1, 3, pool, { myTeamId: 3 })

    // p-1: near-certain gone, but the base model explains it — high level, no named team
    const top = threats.get('p-1')
    expect(top?.threatLevel).toBeGreaterThanOrEqual(2)
    expect(top?.attribution).toBeNull()

    // p-3: only hot because of Bravo's loyalty — named attribution with evidence
    const loyal = threats.get('p-3')
    expect(loyal?.pTakenBeforeMyPick).toBeGreaterThanOrEqual(0.25)
    expect(loyal?.pTakenBeforeMyPick).toBeLessThan(0.5)
    expect(loyal?.threatLevel).toBe(1)
    expect(loyal?.attribution?.teamId).toBe(2)
    expect(loyal?.attribution?.ownerName).toBe('Bravo')
    expect(loyal?.attribution?.atPick).toBe(2)
    expect(loyal?.attribution?.slot).toBe(2)
    expect(loyal?.attribution?.evidence).toEqual(['Drafted Loyal Target both years'])
    expect(loyal?.attribution?.probability).toBeGreaterThan(0.25)

    // p-4: quiet — level 0
    expect(threats.get('p-4')?.threatLevel).toBe(0)

    // survival = 1 − pTaken, and the product stays in [0, 1]
    for (const threat of threats.values()) {
      expect(threat.survivalToMyPick + threat.pTakenBeforeMyPick).toBeCloseTo(1, 9)
      expect(threat.myPick).toBe(3)
    }
  })

  it('25–50% taken without a dominant named team stays level 0', () => {
    const profiles = profilesFrom({ teams: { '1': { teamId: 1, sigma: null, rules: [] } } })
    const smallPool = [candidate('p-1', 'RB', 1), candidate('p-2', 'WR', 2.2)]
    const threats = pickThreats(profiles, [1, 2], 1, 2, smallPool)
    const second = threats.get('p-2')
    expect(second?.pTakenBeforeMyPick).toBeGreaterThanOrEqual(0.25)
    expect(second?.pTakenBeforeMyPick).toBeLessThan(0.5)
    expect(second?.attribution).toBeNull()
    expect(second?.threatLevel).toBe(0)
  })

  it('attributions follow teams when the pick order reshuffles', () => {
    const profiles = profilesFrom(rulesSpec, players)
    // Bravo (team 2) moves from slot 2 to slot 1; horizon widens so his pick is still intervening.
    const shuffled = pickThreats(profiles, [2, 1, 3], 1, 3, pool, { myTeamId: 3 })
    const loyal = shuffled.get('p-3')
    expect(loyal?.attribution?.teamId).toBe(2)
    expect(loyal?.attribution?.ownerName).toBe('Bravo')
    expect(loyal?.attribution?.atPick).toBe(1)
    expect(loyal?.attribution?.slot).toBe(1)
  })

  it('skips my own picks', () => {
    const profiles = profilesFrom(rulesSpec, players)
    const withMine = pickThreats(profiles, [3, 1, 2], 1, 4, pool)
    const skippingMine = pickThreats(profiles, [3, 1, 2], 1, 4, pool, { myTeamId: 3 })
    const taken = (threats: Map<PlayerId, { pTakenBeforeMyPick: number }>): number =>
      threats.get('p-1')?.pTakenBeforeMyPick ?? 0
    expect(taken(skippingMine)).toBeLessThan(taken(withMine))
  })
})

describe('simulateRoomSegment with a room model', () => {
  const pool = [
    rolloutPlayer('p-a', 'RB', 3),
    rolloutPlayer('p-b', 'RB', 1),
    rolloutPlayer('p-c', 'TE', 6),
    rolloutPlayer('p-d', 'WR', 2),
  ]

  it('keeps the pure-ADP path bit-identical without a model (frozen API)', () => {
    const legacy = simulateRoomSegment(pool, 5, 7)
    expect(legacy.map((p) => p.playerId)).toEqual(['p-a', 'p-c'])
    expect(simulateRoomSegment(pool, 5, 7, new Set(), undefined).map((p) => p.playerId)).toEqual(['p-a', 'p-c'])
  })

  it('diverges from pure ADP when a profiled rule bites, and still skips held players', () => {
    const players = [{ id: 'p-c' as PlayerId, name: 'Team TE' }]
    const profiles = profilesFrom(
      {
        teams: {
          '1': { teamId: 1, sigma: null, rules: [{ kind: 'loyalty', playerName: 'Team TE', strength: 1000 }] },
        },
      },
      players,
    )
    const model = { profiles, pickOrder: [1, 2] }
    // pick 1 belongs to team 1: loyalty yanks the TE ahead of every on-time player
    const profiled = simulateRoomSegment(pool, 1, 2, new Set(), model)
    expect(profiled.map((p) => p.playerId)).toEqual(['p-a', 'p-b', 'p-d'])
    const pure = simulateRoomSegment(pool, 1, 2)
    expect(pure.map((p) => p.playerId)).toEqual(['p-a', 'p-c', 'p-d'])
    // held players never leave, even under loyalty
    const held = simulateRoomSegment(pool, 1, 2, new Set(['p-c']), model)
    expect(held.some((p) => p.playerId === 'p-c')).toBe(true)
  })

  it('positional memory: a pos-boost fires for the team’s first take of the position only', () => {
    const profiles = profilesFrom({
      teams: {
        '1': {
          teamId: 1,
          sigma: null,
          rules: [{ kind: 'pos-boost', position: 'TE', rounds: [1, 14], strength: 1000 }],
        },
      },
    })
    const tePool = [
      rolloutPlayer('p-te1', 'TE', 6),
      rolloutPlayer('p-te2', 'TE', 8),
      rolloutPlayer('p-rb1', 'RB', 1),
      rolloutPlayer('p-rb2', 'RB', 2),
    ]
    // 1-team order: picks 1 and 2 both belong to team 1.
    const withMemory = simulateRoomSegment(tePool, 1, 3, new Set(), {
      profiles,
      pickOrder: [1],
      positionCounts: new Map(),
    })
    // first pick reaches for the TE; the second falls back to the board (boost spent)
    expect(withMemory.map((p) => p.playerId)).toEqual(['p-te2', 'p-rb2'])
    // without memory the boost keeps firing and both TEs leave
    const without = simulateRoomSegment(tePool, 1, 3, new Set(), { profiles, pickOrder: [1] })
    expect(without.map((p) => p.playerId)).toEqual(['p-rb1', 'p-rb2'])
  })
})

describe('roster need', () => {
  const emptyProfiles = (): RoomProfiles => profilesFrom({ teams: {} })
  const counts = (entries: [Position, number][]): Map<Position, number> => new Map(entries)

  it('a filled position block is strongly suppressed; K/DST at 1 go to zero', () => {
    const profiles = emptyProfiles()
    const pool = [candidate('p-q', 'QB', 3), candidate('p-r', 'RB', 3.5), candidate('p-k', 'K', 4)]
    const qb = pool[0] as TakeCandidate
    const kicker = pool[2] as TakeCandidate
    const open = takeProbability(profiles, [1, 2], 1, qb, pool)
    const filled = takeProbability(profiles, [1, 2], 1, qb, pool, counts([['QB', 2]]))
    expect(filled).toBeLessThan(open * 0.2)
    expect(takeProbability(profiles, [1, 2], 1, kicker, pool, counts([['K', 1]]))).toBe(0)
    // a distribution with counts still sums to 1
    const distribution = takeDistribution(
      profiles,
      [1, 2],
      1,
      pool,
      counts([
        ['QB', 2],
        ['K', 1],
      ]),
    )
    expect([...distribution.values()].reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 9)
  })

  it('a late starter gap boosts the missing position; no boost before LATE_GAP_ROUND', () => {
    const profiles = emptyProfiles()
    const qb = candidate('p-q', 'QB', 19)
    const rb = candidate('p-r', 'RB', 19.5)
    const pool = [qb, rb]
    const gap = counts([
      ['RB', 2],
      ['WR', 2],
    ])
    const noGap = counts([
      ['QB', 1],
      ['RB', 2],
      ['WR', 2],
    ])
    // pick 19 = round 10 of a 2-team draft: the QB-less team reaches
    expect(takeProbability(profiles, [1, 2], 19, qb, pool, gap)).toBeGreaterThan(
      takeProbability(profiles, [1, 2], 19, qb, pool, noGap) * 1.4,
    )
    // pick 5 = round 3: same counts, no late-gap boost yet
    expect(takeProbability(profiles, [1, 2], 5, qb, pool, gap)).toBeCloseTo(
      takeProbability(profiles, [1, 2], 5, qb, pool, noGap),
      9,
    )
  })

  it('live counts spend a pos-boost outside the sim too', () => {
    const profiles = profilesFrom({
      teams: {
        '1': { teamId: 1, sigma: null, rules: [{ kind: 'pos-boost', position: 'TE', rounds: [1, 14], strength: 5 }] },
      },
    })
    const te = candidate('p-t', 'TE', 4)
    const rb = candidate('p-r', 'RB', 3)
    const pool = [te, rb]
    const boosted = takeProbability(profiles, [1, 2], 1, te, pool)
    const spent = takeProbability(profiles, [1, 2], 1, te, pool, counts([['TE', 1]]))
    expect(spent).toBeLessThan(boosted)
    // spent boost falls back to the plain hazard, not to suppression (TE cap is 2)
    expect(spent).toBeCloseTo(takeProbability(null, [1, 2], 1, te, pool), 9)
  })

  it('sim-forward counts accumulate: a second QB is suppressed, a held K seat never refills', () => {
    const profiles = emptyProfiles()
    const pool = [
      rolloutPlayer('p-q1', 'QB', 1),
      rolloutPlayer('p-q2', 'QB', 2),
      rolloutPlayer('p-r', 'RB', 3),
      rolloutPlayer('p-w', 'WR', 4),
    ]
    // seeded with one live QB: the sim's first pick (best hazard) is still a QB — now at 2 —
    // so the second sim pick must diversify.
    const seeded = simulateRoomSegment(pool, 1, 3, new Set(), {
      profiles,
      pickOrder: [1],
      positionCounts: new Map([[1, counts([['QB', 1]])]]),
    })
    expect(seeded.map((p) => p.playerId)).toEqual(['p-q2', 'p-w'])
    // without counts the model happily double-taps QB
    const unseeded = simulateRoomSegment(pool, 1, 3, new Set(), { profiles, pickOrder: [1] })
    expect(unseeded.map((p) => p.playerId)).toEqual(['p-r', 'p-w'])

    const kPool = [rolloutPlayer('p-k', 'K', 1), rolloutPlayer('p-r2', 'RB', 5)]
    const withK = simulateRoomSegment(kPool, 1, 2, new Set(), {
      profiles,
      pickOrder: [1],
      positionCounts: new Map([[1, counts([['K', 1]])]]),
    })
    expect(withK.map((p) => p.playerId)).toEqual(['p-k'])
  })

  it('a QB-holding team stops being attributed for QB threats', () => {
    const profiles = profilesFrom({
      teams: {
        '1': { teamId: 1, owner: 'Alpha', sigma: null, rules: [] },
        '2': {
          teamId: 2,
          owner: 'Bravo',
          sigma: null,
          rules: [{ kind: 'pos-boost', position: 'QB', rounds: [1, 14], strength: 8 }],
          evidence: { '0': 'QB early both years' },
        },
        '3': { teamId: 3, owner: 'Me', sigma: null, rules: [] },
      },
    })
    const pool = [
      candidate('p-q', 'QB', 6),
      candidate('p-r', 'RB', 1),
      candidate('p-s', 'WR', 2),
      candidate('p-t', 'RB', 12),
    ]
    const before = pickThreats(profiles, [1, 2, 3], 1, 3, pool, { myTeamId: 3 })
    const qbBefore = before.get('p-q')
    expect(qbBefore?.attribution?.teamId).toBe(2)
    expect(qbBefore?.attribution?.evidence).toEqual(['QB early both years'])
    expect(qbBefore?.threatLevel).toBe(1)

    const after = pickThreats(profiles, [1, 2, 3], 1, 3, pool, {
      myTeamId: 3,
      livePicks: [{ teamId: 2, position: 'QB' }],
    })
    const qbAfter = after.get('p-q')
    expect(qbAfter?.attribution).toBeNull()
    expect(qbAfter?.pTakenBeforeMyPick ?? 1).toBeLessThan(qbBefore?.pTakenBeforeMyPick ?? 0)
    expect(qbAfter?.threatLevel).toBe(0)
  })
})
