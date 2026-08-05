import { loadPool } from '../pools.js'
import { DirTree, GitTree, resolveGitRef } from '../tree.js'

import type { CommandRunner, PullRequest } from '../land.js'
import type { SessionHeader } from './model.js'
import type { FileTree } from '../tree.js'

/** The inputs the ratify list does not hold, in the order the header names them (d-kjwswmro). */
const KINDS = ['schemas', 'surfaces', 'facts', 'evidence', 'drafts'] as const

export interface HeaderOptions {
  root: string
  product: string
  increment: string
  branch: string
  pullRequest: PullRequest
  run: CommandRunner
}

/**
 * The header the session draws: the draft it opens on, the changed inputs the ratify list does not
 * carry, and how many review threads nobody has applied. The counts are taken from the branch's
 * merge-base with the head the conflict check uses, so what the head gained meanwhile is not
 * counted as the draft's.
 */
export const readHeader = (options: HeaderOptions): SessionHeader => ({
  product: options.product,
  increment: options.increment,
  branch: options.branch,
  pullRequest: options.pullRequest.number,
  alsoChanged: countChangedInputs(options),
  unresolved: countUnresolvedThreads(options.run, options.root, options.pullRequest),
})

const mergeBase = (run: CommandRunner, root: string): string | undefined => {
  const head = resolveGitRef(root, ['origin/main', 'main'])
  if (head === undefined) {
    return undefined
  }
  try {
    return run('git', ['-C', root, 'merge-base', head, 'HEAD']).trim() || undefined
  } catch {
    return undefined
  }
}

/** Entry ids a pool file holds in a tree, so a facts file gaining two facts reads as two. */
const poolIds = (tree: FileTree, kind: 'fact' | 'run'): Set<string> => {
  try {
    const pool = loadPool(tree)
    return new Set((kind === 'fact' ? pool.facts : pool.runs).map((item) => item.id))
  } catch {
    return new Set()
  }
}

const countChangedInputs = (options: HeaderOptions): SessionHeader['alsoChanged'] => {
  const base = mergeBase(options.run, options.root)
  if (base === undefined) {
    return []
  }
  let changed: string[]
  try {
    changed = options
      .run('git', ['-C', options.root, 'diff', '--name-only', base, 'HEAD'])
      .split('\n')
      .filter((path) => path.length > 0)
  } catch {
    return []
  }
  const head = new DirTree(options.root)
  const before = new GitTree(options.root, base)
  const gained = (kind: 'fact' | 'run'): number => {
    const was = poolIds(before, kind)
    return [...poolIds(head, kind)].filter((id) => !was.has(id)).length
  }
  const counts: Record<(typeof KINDS)[number], number> = {
    // a schema or a surface is one entry per file, so the files are the count
    schemas: changed.filter((path) => path.startsWith('schemas/')).length,
    surfaces: changed.filter((path) => path.startsWith('surfaces/')).length,
    facts: changed.some((path) => path.startsWith('facts/')) ? gained('fact') : 0,
    evidence: changed.some((path) => path.startsWith('evidence/')) ? gained('run') : 0,
    drafts: new Set(
      changed
        .map((path) => /^(products\/[^/]+\/increments\/wip-[^/]+)\//.exec(path)?.[1])
        .filter((dir): dir is string => dir !== undefined && !dir.endsWith(`/${options.increment}`)),
    ).size,
  }
  return KINDS.filter((kind) => counts[kind] > 0).map((kind) => ({ kind, count: counts[kind] }))
}

const THREADS_QUERY = `query($owner:String!,$repo:String!,$number:Int!){
  repository(owner:$owner,name:$repo){
    pullRequest(number:$number){ reviewThreads(first:100){ nodes { isResolved } } }
  }
}`

/**
 * How many review threads are unresolved: a direction the owner left from a comment is unapplied
 * until an agent writes it into the sources, and the count is what keeps a draft from publishing
 * over one (d-tmyu6t1y).
 */
const countUnresolvedThreads = (run: CommandRunner, root: string, pullRequest: PullRequest): number => {
  let raw: string
  try {
    raw = run(
      'gh',
      [
        'api',
        'graphql',
        '-f',
        `query=${THREADS_QUERY}`,
        '-F',
        `owner=${pullRequest.owner}`,
        '-F',
        `repo=${pullRequest.repo}`,
        '-F',
        `number=${pullRequest.number}`,
      ],
      { cwd: root },
    )
  } catch {
    return 0
  }
  try {
    const parsed = JSON.parse(raw) as {
      data?: { repository?: { pullRequest?: { reviewThreads?: { nodes?: { isResolved?: boolean }[] } } } }
    }
    const nodes = parsed.data?.repository?.pullRequest?.reviewThreads?.nodes ?? []
    return nodes.filter((node) => node.isResolved !== true).length
  } catch {
    return 0
  }
}
