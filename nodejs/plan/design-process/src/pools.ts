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

/** Fact ids declared in the repo-wide `facts/` pool. */
export const loadFactIds = (tree: FileTree): Set<string> => {
  const ids = new Set<string>()
  for (const path of tree.paths().filter((p) => p.startsWith('facts/') && isYamlPath(p))) {
    let doc: unknown
    try {
      doc = parse(tree.read(path))
    } catch {
      continue
    }
    if (Array.isArray(doc)) {
      for (const entry of doc) {
        const id = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>).id : undefined
        if (typeof id === 'string') {
          ids.add(id)
        }
      }
    }
  }
  return ids
}
