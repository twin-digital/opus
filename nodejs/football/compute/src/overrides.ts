import { readFileSync } from 'node:fs'

import type { Player, PlayerId } from '@twin-digital/football-data'

/**
 * Manual override lane: `ban` removes a player from recommendations entirely (he stays visible
 * as data); `boost` shifts his projected league points by ±N before everything downstream
 * (VOR, tiers, benchmarks, rollouts).
 */
export type PlayerOverride =
  | { playerId: PlayerId; action: 'ban'; note?: string }
  | { playerId: PlayerId; action: 'boost'; points: number; note?: string }

/**
 * One entry of an overrides.json file; `player` is a name (case-insensitive) or a `p-` id.
 * `action` is a plain string — file contents are unvalidated until `resolveOverrides` runs.
 */
export interface OverrideSpec {
  player: string
  action: string
  points?: number
  note?: string
}

export interface AppliedOverrides<T> {
  /** Input rows with boosts folded into points; order preserved, banned rows kept. */
  rows: T[]
  bannedIds: Set<PlayerId>
}

/** Fold boosts into points (null points boost from 0 — a boost can make an unprojected player draftable). */
export const applyOverrides = <T extends { playerId: PlayerId; points: number | null }>(
  rows: T[],
  overrides: PlayerOverride[],
): AppliedOverrides<T> => {
  const boostById = new Map<PlayerId, number>()
  const bannedIds = new Set<PlayerId>()
  for (const override of overrides) {
    if (override.action === 'ban') {
      bannedIds.add(override.playerId)
    } else {
      boostById.set(override.playerId, (boostById.get(override.playerId) ?? 0) + override.points)
    }
  }
  const applied = rows.map((row) => {
    const boost = boostById.get(row.playerId)
    return boost === undefined ? row : { ...row, points: (row.points ?? 0) + boost }
  })
  return { rows: applied, bannedIds }
}

/** Resolve override specs against the player table; an ambiguous or unknown name is a hard error. */
export const resolveOverrides = (specs: OverrideSpec[], players: Pick<Player, 'id' | 'name'>[]): PlayerOverride[] => {
  const byName = new Map<string, PlayerId[]>()
  const ids = new Set<PlayerId>(players.map((player) => player.id))
  for (const player of players) {
    const key = player.name.toLowerCase()
    const list = byName.get(key)
    if (list === undefined) {
      byName.set(key, [player.id])
    } else {
      list.push(player.id)
    }
  }

  return specs.map((spec) => {
    let playerId: PlayerId
    if (spec.player.startsWith('p-')) {
      if (!ids.has(spec.player as PlayerId)) {
        throw new Error(`override player id not found: ${spec.player}`)
      }
      playerId = spec.player as PlayerId
    } else {
      const matches = byName.get(spec.player.toLowerCase()) ?? []
      if (matches.length === 0) {
        throw new Error(`override player not found: ${JSON.stringify(spec.player)}`)
      }
      if (matches.length > 1) {
        throw new Error(
          `override player name is ambiguous: ${JSON.stringify(spec.player)} matches ${matches.join(', ')} — use a p- id`,
        )
      }
      playerId = matches[0] as PlayerId
    }
    if (spec.action === 'ban') {
      return { playerId, action: 'ban', ...(spec.note !== undefined && { note: spec.note }) }
    }
    if (spec.action !== 'boost') {
      throw new Error(`override action must be 'ban' or 'boost': ${JSON.stringify(spec)}`)
    }
    if (typeof spec.points !== 'number' || !Number.isFinite(spec.points)) {
      throw new Error(`boost override needs a finite points number: ${JSON.stringify(spec)}`)
    }
    return { playerId, action: 'boost', points: spec.points, ...(spec.note !== undefined && { note: spec.note }) }
  })
}

/** Read and resolve an overrides.json file (an array of OverrideSpec). */
export const loadOverridesFile = (filePath: string, players: Pick<Player, 'id' | 'name'>[]): PlayerOverride[] => {
  const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'))
  if (!Array.isArray(parsed)) {
    throw new Error(`overrides file must be a JSON array: ${filePath}`)
  }
  return resolveOverrides(parsed as OverrideSpec[], players)
}
