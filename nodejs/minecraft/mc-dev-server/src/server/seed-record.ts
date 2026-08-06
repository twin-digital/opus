import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { formatSeed } from '../seed.js'
import { HARNESS_DIR, WORLDS_RECORD } from './layout.js'

import type { ComposeClient } from '../docker/compose.js'

/**
 * The harness's record of which seed generated which world.
 *
 * The server records the seed it was asked for, not the one an existing world already had, and the
 * world's own copy is binary — so this file is the only way back to a world's generation seed. It
 * is written before the world it describes is generated: a record naming a world that does not
 * exist is harmless, because the world is then generated from the seed on record, while a world
 * with no record can never be reproduced.
 *
 * Seeds are decimal strings, so a 64-bit value survives a JSON round trip in any reader.
 */
export interface WorldsRecord {
  version: 1
  worlds: Record<string, { seed: string }>
}

const EMPTY: WorldsRecord = { version: 1, worlds: {} }

/** Parses the record, treating anything unreadable as empty — it is a cache of history, not state. */
export const parseWorldsRecord = (text: string): WorldsRecord => {
  try {
    const parsed = JSON.parse(text) as Partial<WorldsRecord>
    if (parsed.version !== 1 || typeof parsed.worlds !== 'object') {
      return EMPTY
    }
    return { version: 1, worlds: parsed.worlds }
  } catch {
    return EMPTY
  }
}

/** Renders the record as the harness writes it. */
export const renderWorldsRecord = (record: WorldsRecord): string => `${JSON.stringify(record, undefined, 2)}\n`

/** The seeds the record holds, as bigints. */
export const seedsOf = (record: WorldsRecord): Record<string, bigint> => {
  const seeds: Record<string, bigint> = {}
  for (const [level, entry] of Object.entries(record.worlds)) {
    try {
      seeds[level] = BigInt(entry.seed)
    } catch {
      // a seed that will not parse is no record at all
    }
  }
  return seeds
}

/** The record with one world's generation seed added. */
export const withWorld = (record: WorldsRecord, level: string, seed: bigint): WorldsRecord => ({
  version: 1,
  worlds: { ...record.worlds, [level]: { seed: formatSeed(seed) } },
})

/** Reads the record off the volume. A volume that holds none reads as empty. */
export const readWorldsRecord = async (compose: ComposeClient): Promise<WorldsRecord> => {
  const result = await compose.exec(['cat', WORLDS_RECORD])
  return result.exitCode === 0 ? parseWorldsRecord(result.stdout) : { version: 1, worlds: {} }
}

/**
 * Writes the record onto the volume. It travels by `cp` like everything else the harness puts on
 * the server, so no bind mount is needed and a remote daemon is served the same as a local one.
 */
export const writeWorldsRecord = async (compose: ComposeClient, record: WorldsRecord): Promise<void> => {
  await compose.exec(['mkdir', '-p', HARNESS_DIR])
  const staging = await mkdtemp(join(tmpdir(), 'mc-dev-server-worlds-'))
  try {
    const local = join(staging, 'worlds.json')
    await writeFile(local, renderWorldsRecord(record), 'utf8')
    await compose.copyIn(local, WORLDS_RECORD)
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}
