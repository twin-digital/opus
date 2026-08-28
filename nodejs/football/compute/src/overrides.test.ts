import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { PlayerId } from '@twin-digital/football-data'
import { describe, expect, it } from 'vitest'

import { applyOverrides, loadOverridesFile, resolveOverrides } from './overrides.js'

const PLAYERS = [
  { id: 'p-1' as PlayerId, name: 'Mike Evans' },
  { id: 'p-2' as PlayerId, name: 'Chris Godwin' },
  { id: 'p-3' as PlayerId, name: 'Josh Allen' },
  { id: 'p-4' as PlayerId, name: 'Josh Allen' }, // the LB, same name
]

describe('applyOverrides', () => {
  it('folds boosts into points and collects bans without dropping rows', () => {
    const rows = [
      { playerId: 'p-1' as PlayerId, points: 100 },
      { playerId: 'p-2' as PlayerId, points: 90 },
      { playerId: 'p-3' as PlayerId, points: null },
    ]
    const applied = applyOverrides(rows, [
      { playerId: 'p-1', action: 'boost', points: -15 },
      { playerId: 'p-2', action: 'ban' },
      { playerId: 'p-3', action: 'boost', points: 40 },
    ])
    expect(applied.rows.map((row) => row.points)).toEqual([85, 90, 40])
    expect(applied.bannedIds).toEqual(new Set(['p-2']))
    expect(applied.rows).toHaveLength(3)
    expect(rows[0]?.points).toBe(100) // pure: input untouched
  })
})

describe('resolveOverrides', () => {
  it('resolves names case-insensitively and p- ids directly', () => {
    const resolved = resolveOverrides(
      [
        { player: 'mike evans', action: 'ban', note: 'never' },
        { player: 'p-2', action: 'boost', points: 20 },
      ],
      PLAYERS,
    )
    expect(resolved).toEqual([
      { playerId: 'p-1', action: 'ban', note: 'never' },
      { playerId: 'p-2', action: 'boost', points: 20 },
    ])
  })

  it('throws on ambiguous names, unknown players, and malformed specs', () => {
    expect(() => resolveOverrides([{ player: 'Josh Allen', action: 'ban' }], PLAYERS)).toThrow(/ambiguous/)
    expect(() => resolveOverrides([{ player: 'Nobody Real', action: 'ban' }], PLAYERS)).toThrow(/not found/)
    expect(() => resolveOverrides([{ player: 'p-99', action: 'ban' }], PLAYERS)).toThrow(/not found/)
    expect(() => resolveOverrides([{ player: 'Mike Evans', action: 'boost' }], PLAYERS)).toThrow(/finite points/)
    expect(() => resolveOverrides([{ player: 'Mike Evans', action: 'delete' }], PLAYERS)).toThrow(
      /must be 'ban' or 'boost'/,
    )
  })
})

describe('loadOverridesFile', () => {
  it('reads and resolves a JSON array', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'overrides-'))
    const file = path.join(dir, 'overrides.json')
    writeFileSync(file, JSON.stringify([{ player: 'Chris Godwin', action: 'boost', points: 10 }]))
    expect(loadOverridesFile(file, PLAYERS)).toEqual([{ playerId: 'p-2', action: 'boost', points: 10 }])
  })

  it('rejects a non-array file', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'overrides-'))
    const file = path.join(dir, 'overrides.json')
    writeFileSync(file, JSON.stringify({ player: 'Chris Godwin', action: 'ban' }))
    expect(() => loadOverridesFile(file, PLAYERS)).toThrow(/JSON array/)
  })
})
