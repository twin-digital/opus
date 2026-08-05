import type { PackKind } from '@twin-digital/mc-dev-kit'

/** A version as either side may spell it; the two need not agree. */
export type ActivationVersion = string | [number, number, number]

/** One entry of a world's activation list. */
export interface ActivationEntry {
  pack_id: string
  version: ActivationVersion
}

/** A pack the run hosts, with the payload that should sit in its pool directory. */
export interface DesiredPack {
  /** the header uuid, lowercased */
  uuid: string
  kind: PackKind
  /** as the pack set reports it */
  version: ActivationVersion
  /** the owning package, for reporting */
  packageName: string
  /** pack-relative POSIX paths of the payload's files */
  files: readonly string[]
  /** the host directory the payload is copied from */
  sourceDir: string
}

/** A pack directory the pool holds, as a reconcile read it back. */
export interface PooledPack {
  uuid: string
  kind: PackKind
  /** pack-relative POSIX paths the pool directory holds */
  files: readonly string[]
}

/** A value held per pack kind. */
export interface ByKind<T> {
  behavior: T
  resource: T
}

/** What a reconcile read off the running server. */
export interface ObservedServer {
  pools: ByKind<readonly PooledPack[]>
  activation: ByKind<readonly ActivationEntry[]>
}

/** A pool directory a reconcile removes. */
export interface PoolRemoval {
  kind: PackKind
  uuid: string
}

/** How a reconcile brings its change live. */
export type ApplyMode = 'none' | 'reload' | 'restart'

/** The difference a reconcile applies, and how it brings it live. */
export interface ReconcilePlan {
  /** pool directories to replace, in selection order */
  copy: readonly DesiredPack[]
  /** pool directories the selection does not account for, whoever put them there */
  remove: readonly PoolRemoval[]
  /** the activation lists as they should stand, in selection order */
  activation: ByKind<readonly ActivationEntry[]>
  /** whether either list differs from what the server holds */
  writeActivation: boolean
  apply: ApplyMode
  /** why a restart was priced, for the stream */
  restartReasons: readonly string[]
}

const KINDS: readonly PackKind[] = ['behavior', 'resource']

const sameList = (left: readonly ActivationEntry[], right: readonly ActivationEntry[]): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const grew = (desired: readonly string[], pooled: readonly string[]): boolean => {
  const held = new Set(pooled)
  return desired.some((file) => !held.has(file))
}

const sameFiles = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && [...left].sort().join('\0') === [...right].sort().join('\0')

/**
 * Computes the difference between what the run hosts and what the server holds.
 *
 * Presence, activation identity, and the file names a pool directory holds are all that is
 * compared; no file's content is ever read back. `changed` names the packs a watcher saw rebuild —
 * at start nothing is named, which is what makes a reconcile against an already-matching server a
 * no-op.
 */
export const planReconcile = (input: {
  desired: readonly DesiredPack[]
  observed: ObservedServer
  changed?: ReadonlySet<string>
}): ReconcilePlan => {
  const { desired, observed } = input
  const changed = input.changed ?? new Set<string>()

  const pooled = new Map<string, PooledPack>()
  for (const kind of KINDS) {
    for (const pack of observed.pools[kind]) {
      pooled.set(`${kind}/${pack.uuid.toLowerCase()}`, pack)
    }
  }

  const copy: DesiredPack[] = []
  const restartReasons: string[] = []
  const wanted = new Set<string>()

  for (const pack of desired) {
    const key = `${pack.kind}/${pack.uuid.toLowerCase()}`
    wanted.add(key)
    const inPool = pooled.get(key)

    if (inPool === undefined) {
      copy.push(pack)
      restartReasons.push(`${pack.packageName}: added to the pool`)
      continue
    }

    if (grew(pack.files, inPool.files)) {
      copy.push(pack)
      restartReasons.push(`${pack.packageName}: gained a file the world did not load`)
      continue
    }

    if (changed.has(pack.uuid.toLowerCase()) || !sameFiles(pack.files, inPool.files)) {
      copy.push(pack)
    }
  }

  const remove: PoolRemoval[] = []
  for (const [key, pack] of pooled) {
    if (!wanted.has(key)) {
      remove.push({ kind: pack.kind, uuid: pack.uuid })
      restartReasons.push(`${pack.uuid}: removed from the pool`)
    }
  }

  const activation = {
    behavior: desired.filter((p) => p.kind === 'behavior').map(toEntry),
    resource: desired.filter((p) => p.kind === 'resource').map(toEntry),
  }

  const writeActivation = KINDS.some((kind) => !sameList(activation[kind], observed.activation[kind]))
  if (writeActivation) {
    restartReasons.push('the world activation list changed')
  }

  const apply: ApplyMode =
    restartReasons.length > 0 ? 'restart'
    : copy.length > 0 ? 'reload'
    : 'none'

  return { copy, remove, activation, writeActivation, apply, restartReasons }
}

const toEntry = (pack: DesiredPack): ActivationEntry => ({ pack_id: pack.uuid, version: pack.version })
