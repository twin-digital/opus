import { ulid } from 'ulid'

/**
 * Central registry of app-minted id prefixes. Prefixes are 1–3 characters; single characters
 * are reserved for core, unambiguous entities. Future minted entities (e.g. an append-only
 * market snapshot) register 2–3 character prefixes here.
 */
export const ID_PREFIXES = {
  p: 'Player',
  nw: 'PlayerNews',
} as const

export type IdPrefix = keyof typeof ID_PREFIXES

/** App-minted: assigned at first ingest, stable across seasons and team changes, never reused. */
export type PlayerId = `p-${string}`

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/

export const mintId = (prefix: IdPrefix): string => `${prefix}-${ulid()}`

export const mintPlayerId = (): PlayerId => mintId('p') as PlayerId

export const isPlayerId = (value: string): value is PlayerId =>
  value.startsWith('p-') && ULID_PATTERN.test(value.slice(2))

/** App-minted id for a stored news item. */
export type NewsId = `nw-${string}`

export const mintNewsId = (): NewsId => mintId('nw') as NewsId

export const isNewsId = (value: string): value is NewsId => value.startsWith('nw-') && ULID_PATTERN.test(value.slice(3))
