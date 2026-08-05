import { activationFile, DATA_ROOT, poolDir, SERVER_PROPERTIES, WORLDS_RECORD } from './layout.js'
import { parseWorldsRecord, seedsOf } from './seed-record.js'

import type { ComposeClient } from '../docker/compose.js'
import type { ActivationEntry, ObservedServer, PooledPack } from '../deploy/plan.js'
import type { RunningServer } from '../start/ladder.js'
import type { PackKind } from '@twin-digital/mc-dev-kit'
import type { WorldsRecord } from './seed-record.js'

/** Reads the level name out of the server's own configuration on the volume. */
export const levelNameFrom = (serverProperties: string): string | undefined => {
  for (const line of serverProperties.split('\n')) {
    const match = /^\s*level-name\s*=\s*(.*?)\s*$/.exec(line)
    if (match !== null) {
      return match[1]
    }
  }
  return undefined
}

/** Assembles what the ladder compares against, entirely from the running server. */
export const runningServerFrom = (input: {
  image: string
  port?: number
  serverProperties: string
  worlds: readonly string[]
  record: WorldsRecord
}): RunningServer => ({
  level: levelNameFrom(input.serverProperties) ?? '',
  image: input.image,
  ...(input.port === undefined ? {} : { port: input.port }),
  worlds: input.worlds,
  seeds: seedsOf(input.record),
})

/**
 * The section marker the harness's own reads carry. Everything the harness reads off the server
 * comes back from one invocation, so a read is one round trip however far away the daemon is.
 */
export const MARKER = '##mc-dev-server##'

/** Quotes one value for the container's shell. */
export const shellQuote = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`

const section = (name: string): string => `echo ${shellQuote(`${MARKER}${name}`)}`

/** Splits a marked read into its sections. */
export const splitSections = (text: string): Record<string, string[]> => {
  const sections: Record<string, string[]> = {}
  let current: string[] | undefined
  for (const line of text.split('\n')) {
    const trimmed = line.trimEnd()
    if (trimmed.startsWith(MARKER)) {
      current = []
      sections[trimmed.slice(MARKER.length)] = current
      continue
    }
    current?.push(line)
  }
  return sections
}

const nonEmpty = (lines: string[] | undefined): string[] => (lines ?? []).filter((line) => line.trim() !== '')

const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

/** Reads an activation list back, treating anything unreadable as no list at all. */
export const parseActivation = (text: string): readonly ActivationEntry[] => {
  try {
    const parsed = JSON.parse(text) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((entry): entry is ActivationEntry => typeof (entry as ActivationEntry).pack_id === 'string')
  } catch {
    return []
  }
}

const KINDS: readonly PackKind[] = ['behavior', 'resource']

/** The one read a reconcile makes: both pools, the file names in them, and both activation lists. */
export const observedScript = (level: string): string =>
  [
    ...KINDS.flatMap((kind) => [
      section(`dirs.${kind}`),
      `find ${shellQuote(poolDir(kind))} -mindepth 1 -maxdepth 1 -type d 2>/dev/null || true`,
      section(`files.${kind}`),
      `find ${shellQuote(poolDir(kind))} -mindepth 2 -type f 2>/dev/null || true`,
      section(`activation.${kind}`),
      `cat ${shellQuote(activationFile(level, kind))} 2>/dev/null || true`,
    ]),
    section('end'),
  ].join('\n')

/** Rebuilds the pool and activation state from one marked read. */
export const parseObserved = (text: string): ObservedServer => {
  const sections = splitSections(text)
  const pools: Partial<Record<PackKind, readonly PooledPack[]>> = {}
  const activation: Partial<Record<PackKind, readonly ActivationEntry[]>> = {}

  for (const kind of KINDS) {
    const prefix = `${poolDir(kind)}/`
    const packs = new Map<string, string[]>()

    for (const dir of nonEmpty(sections[`dirs.${kind}`])) {
      packs.set(basename(dir.trim()), [])
    }
    for (const file of nonEmpty(sections[`files.${kind}`])) {
      const path = file.trim()
      if (!path.startsWith(prefix)) {
        continue
      }
      const relative = path.slice(prefix.length)
      const slash = relative.indexOf('/')
      if (slash <= 0) {
        continue
      }
      const uuid = relative.slice(0, slash)
      const held = packs.get(uuid) ?? []
      held.push(relative.slice(slash + 1))
      packs.set(uuid, held)
    }

    pools[kind] = [...packs].map(([uuid, files]) => ({ uuid, kind, files: [...files].sort() }))
    activation[kind] = parseActivation(nonEmpty(sections[`activation.${kind}`]).join('\n'))
  }

  return {
    pools: { behavior: pools.behavior ?? [], resource: pools.resource ?? [] },
    activation: { behavior: activation.behavior ?? [], resource: activation.resource ?? [] },
  }
}

/** The one read the start ladder makes: the served world, the worlds held, and the seeds. */
export const runningScript = (): string =>
  [
    section('properties'),
    `cat ${shellQuote(SERVER_PROPERTIES)} 2>/dev/null || true`,
    section('worlds'),
    `find ${shellQuote(`${DATA_ROOT}/worlds`)} -mindepth 1 -maxdepth 1 -type d 2>/dev/null || true`,
    section('record'),
    `cat ${shellQuote(WORLDS_RECORD)} 2>/dev/null || true`,
    section('end'),
  ].join('\n')

/** Reads the running server: its container settings, its world, and the worlds the volume holds. */
export const readRunningServer = async (compose: ComposeClient): Promise<RunningServer | undefined> => {
  const container = await compose.running()
  if (container === undefined) {
    return undefined
  }

  const sections = splitSections((await compose.exec(['sh', '-c', runningScript()])).stdout)
  return runningServerFrom({
    image: container.image,
    ...(container.port === undefined ? {} : { port: container.port }),
    serverProperties: nonEmpty(sections.properties).join('\n'),
    worlds: nonEmpty(sections.worlds).map((dir) => basename(dir.trim())),
    record: parseWorldsRecord(nonEmpty(sections.record).join('\n')),
  })
}

/** Reads the pool contents and activation lists a reconcile compares against. */
export const readObservedServer = async (compose: ComposeClient, level: string): Promise<ObservedServer> =>
  parseObserved((await compose.exec(['sh', '-c', observedScript(level)])).stdout)
