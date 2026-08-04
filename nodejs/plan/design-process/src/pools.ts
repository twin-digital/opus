import { parse } from 'yaml'

import type { FileTree } from './tree.js'
import type { Finding } from './types.js'

/** Root-relative contract identity: /<namespace>/<segments...>@<version>, leading slash mandatory. */
export const IDENTITY_PATTERN = /^\/[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)+@(\d+)$/

export interface PoolEntry {
  /** The full identity, e.g. `/design-process/requirements@1`. */
  id: string
  /** The identity without its version, e.g. `/design-process/requirements`. */
  name: string
  version: number
  path: string
}

export interface SchemaPoolEntry extends PoolEntry {
  schema: Record<string, unknown>
}

export interface ApiPoolEntry extends PoolEntry {
  content: string
}

export const parseIdentity = (id: string): { name: string; version: number } | undefined => {
  const match = IDENTITY_PATTERN.exec(id)
  if (!match) {
    return undefined
  }
  const at = id.lastIndexOf('@')
  return { name: id.slice(0, at), version: Number(id.slice(at + 1)) }
}

const isYamlPath = (path: string) => path.endsWith('.yaml') || path.endsWith('.yml')

export interface SchemaPool {
  entries: Map<string, SchemaPoolEntry>
  findings: Finding[]
}

/** Load `schemas/**` as the schema pool: JSON Schema documents identified in-file by `$id`. */
export const loadSchemaPool = (tree: FileTree): SchemaPool => {
  const entries = new Map<string, SchemaPoolEntry>()
  const findings: Finding[] = []

  for (const path of tree.paths().filter((p) => p.startsWith('schemas/') && isYamlPath(p))) {
    let doc: unknown
    try {
      doc = parse(tree.read(path))
    } catch (error) {
      findings.push({
        rule: 'schema-pool-parse',
        claims: ['r-2fytqadu'],
        path,
        message: `not parseable as YAML: ${error instanceof Error ? error.message : String(error)}`,
      })
      continue
    }
    if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
      findings.push({ rule: 'schema-pool-parse', claims: ['r-2fytqadu'], path, message: 'not a mapping' })
      continue
    }
    const schema = doc as Record<string, unknown>
    const id = schema.$id
    const identity = typeof id === 'string' ? parseIdentity(id) : undefined
    if (typeof id !== 'string' || identity === undefined) {
      findings.push({
        rule: 'schema-identity',
        claims: ['r-2fytqadu', 'd-3wjypyx6'],
        path,
        message:
          typeof id === 'string' ?
            `$id ${JSON.stringify(id)} is not a root-relative /<namespace>/<entity>@<version> identity`
          : 'missing $id',
      })
      continue
    }
    const existing = entries.get(id)
    if (existing) {
      findings.push({
        rule: 'schema-identity-unique',
        claims: ['r-2fytqadu'],
        path,
        message: `duplicate identity ${id}: also claimed by ${existing.path}`,
      })
      continue
    }
    entries.set(id, { id, name: identity.name, version: identity.version, path, schema })
  }

  findings.push(...checkDenseVersions(entries, 'schema-versions-dense', ['r-2fytqadu']))
  return { entries, findings }
}

const API_COMMENT_PATTERNS = [/^\s*\/\/\s*api:\s*(\S+)\s*$/m, /^\s*#\s*api:\s*(\S+)\s*$/m]

/** Extract an api file's declared identity by its per-tech convention. */
export const extractApiIdentity = (path: string, content: string): string | undefined => {
  if (isYamlPath(path) || path.endsWith('.json')) {
    try {
      const doc: unknown = parse(content)
      if (typeof doc === 'object' && doc !== null && !Array.isArray(doc)) {
        const info = (doc as Record<string, unknown>).info
        if (typeof info === 'object' && info !== null) {
          const id = (info as Record<string, unknown>)['x-api-id']
          if (typeof id === 'string') {
            return id
          }
        }
      }
    } catch {
      // fall through to comment-header extraction
    }
  }
  for (const pattern of API_COMMENT_PATTERNS) {
    const match = pattern.exec(content)
    if (match) {
      return match[1]
    }
  }
  return undefined
}

export interface ApiPool {
  entries: Map<string, ApiPoolEntry>
  findings: Finding[]
}

/** Load `apis/**` as the api pool: authored surfaces identified in-file by a per-tech header. */
export const loadApiPool = (tree: FileTree): ApiPool => {
  const entries = new Map<string, ApiPoolEntry>()
  const findings: Finding[] = []

  for (const path of tree.paths().filter((p) => p.startsWith('apis/'))) {
    const content = tree.read(path)
    const id = extractApiIdentity(path, content)
    if (id === undefined) {
      findings.push({
        rule: 'api-identity',
        claims: ['r-lll68661', 'd-u3u3sbmb'],
        path,
        message: 'no api identity header found',
      })
      continue
    }
    const identity = parseIdentity(id)
    if (identity === undefined) {
      findings.push({
        rule: 'api-identity',
        claims: ['r-lll68661', 'd-u3u3sbmb'],
        path,
        message: `api identity ${JSON.stringify(id)} is not a root-relative /<namespace>/<name>@<version> identity`,
      })
      continue
    }
    const existing = entries.get(id)
    if (existing) {
      findings.push({
        rule: 'api-identity-unique',
        claims: ['r-lll68661'],
        path,
        message: `duplicate identity ${id}: also claimed by ${existing.path}`,
      })
      continue
    }
    entries.set(id, { id, name: identity.name, version: identity.version, path, content })
  }

  findings.push(...checkDenseVersions(entries, 'api-versions-dense', ['r-lll68661']))
  return { entries, findings }
}

const checkDenseVersions = (entries: Map<string, PoolEntry>, rule: string, claims: string[]): Finding[] => {
  const byName = new Map<string, PoolEntry[]>()
  for (const entry of entries.values()) {
    const list = byName.get(entry.name) ?? []
    list.push(entry)
    byName.set(entry.name, list)
  }
  const findings: Finding[] = []
  for (const [name, list] of byName) {
    const versions = new Set(list.map((entry) => entry.version))
    const max = Math.max(...versions)
    const missing = Array.from({ length: max }, (_, index) => index + 1).filter((version) => !versions.has(version))
    if (missing.length > 0) {
      findings.push({
        rule,
        claims,
        message: `${name} versions are not dense: missing ${missing.map((v) => `@${v}`).join(', ')}`,
      })
    }
  }
  return findings
}

export interface FactsPool {
  /** Every declared fact id, whatever its status. */
  ids: Set<string>
  /** The subset whose entries carry `status: retired`. */
  retired: Set<string>
}

/** One fact or run entry, with the file it was declared in for finding locations. */
export interface PoolItem {
  /** The declared id, or `''` when the entry has no string id. */
  id: string
  kind: 'fact' | 'run'
  data: Record<string, unknown>
  path: string
}

/** One loaded `facts/` or `evidence/` file: its entries, and whether they came wrapped. */
export interface PoolFile {
  path: string
  kind: 'fact' | 'run'
  /** true when the file is a `{version, facts|runs: [...]}` wrapper; false for a bare sequence. */
  wrapped: boolean
  /** The wrapper mapping when `wrapped`, for validation against its file schema. */
  wrapper?: Record<string, unknown>
  items: PoolItem[]
}

/** The repo-wide facts + runs pool. Facts and runs share one id namespace. */
export interface Pool {
  files: PoolFile[]
  /** Pool files the loader could not read: an unparseable file is itself a finding (d-qo2qelw4). */
  findings: Finding[]
  facts: PoolItem[]
  runs: PoolItem[]
  /** id -> first declaring entry, across facts and runs. */
  byId: Map<string, PoolItem>
  /** Entries whose id was already declared by an earlier entry. */
  duplicates: PoolItem[]
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

// Accepts both the current bare sequence and the later `{version, facts|runs: [...]}` wrapper.
// An evidence/ mapping without the runs wrapper is probe artifact material and is skipped.
const loadPoolFile = (
  tree: FileTree,
  path: string,
  kind: 'fact' | 'run',
  findings: Finding[],
): PoolFile | undefined => {
  let doc: unknown
  try {
    doc = parse(tree.read(path))
  } catch (error) {
    // the file's facts and runs would otherwise leave the pool with no signal (d-qo2qelw4)
    findings.push({
      rule: 'pool-file-parse',
      claims: ['r-xxa1st52', 'd-qo2qelw4'],
      path,
      message: `not parseable as YAML: ${error instanceof Error ? error.message : String(error)}`,
    })
    return undefined
  }
  const wrapperKey = kind === 'fact' ? 'facts' : 'runs'
  let entries: unknown[]
  let wrapped = false
  let wrapper: Record<string, unknown> | undefined
  if (Array.isArray(doc)) {
    entries = doc
  } else {
    const record = asRecord(doc)
    if (record && 'version' in record && Array.isArray(record[wrapperKey])) {
      wrapped = true
      wrapper = record
      entries = record[wrapperKey] as unknown[]
    } else {
      return undefined
    }
  }
  const items: PoolItem[] = entries.map((entry) => {
    const data = asRecord(entry) ?? {}
    return { id: typeof data.id === 'string' ? data.id : '', kind, data, path }
  })
  return { path, kind, wrapped, wrapper, items }
}

/** Load the repo-wide `facts/` and `evidence/` pools into fact and run entries. */
export const loadPool = (tree: FileTree): Pool => {
  const files: PoolFile[] = []
  const findings: Finding[] = []
  for (const path of tree.paths().filter((p) => p.startsWith('facts/') && isYamlPath(p))) {
    const file = loadPoolFile(tree, path, 'fact', findings)
    if (file) {
      files.push(file)
    }
  }
  for (const path of tree.paths().filter((p) => p.startsWith('evidence/') && isYamlPath(p))) {
    const file = loadPoolFile(tree, path, 'run', findings)
    if (file) {
      files.push(file)
    }
  }
  const facts = files.filter((file) => file.kind === 'fact').flatMap((file) => file.items)
  const runs = files.filter((file) => file.kind === 'run').flatMap((file) => file.items)
  const byId = new Map<string, PoolItem>()
  const duplicates: PoolItem[] = []
  // runs load before facts so a run: source resolves the same way whichever came first
  for (const item of [...runs, ...facts]) {
    if (item.id === '') {
      continue
    }
    if (byId.has(item.id)) {
      duplicates.push(item)
    } else {
      byId.set(item.id, item)
    }
  }
  return { files, findings, facts, runs, byId, duplicates }
}

/** Fact ids and statuses declared in the repo-wide `facts/` pool. */
export const loadFacts = (tree: FileTree): FactsPool => {
  const ids = new Set<string>()
  const retired = new Set<string>()
  for (const item of loadPool(tree).facts) {
    if (item.id === '') {
      continue
    }
    ids.add(item.id)
    if (item.data.status === 'retired') {
      retired.add(item.id)
    }
  }
  return { ids, retired }
}
