import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** The branch the backlog lives on; orphan, never merged. */
export const BACKLOG_BRANCH = 'backlog'

export interface StoreOptions {
  root: string
  remote?: string
  /** Skip the fetch that refreshes the local view of the branch. */
  offline?: boolean
  /** Push the commit to the remote. Default true; a repo with no such remote skips it. */
  push?: boolean
}

const git = (root: string, args: string[], env?: NodeJS.ProcessEnv): string =>
  execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: env === undefined ? process.env : { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

const tryGit = (root: string, args: string[]): string | undefined => {
  try {
    return git(root, args)
  } catch {
    return undefined
  }
}

const remoteName = (options: StoreOptions): string => options.remote ?? 'origin'

const hasRemote = (options: StoreOptions): boolean =>
  tryGit(options.root, ['remote'])
    ?.split('\n')
    .some((name) => name.trim() === remoteName(options)) === true

/** The commit the backlog branch points at — the remote's tip where there is one. */
export const backlogTip = (options: StoreOptions): string | undefined => {
  const remote = remoteName(options)
  if (!options.offline && hasRemote(options)) {
    tryGit(options.root, [
      'fetch',
      '--quiet',
      remote,
      `+refs/heads/${BACKLOG_BRANCH}:refs/remotes/${remote}/${BACKLOG_BRANCH}`,
    ])
    const fetched = tryGit(options.root, [
      'rev-parse',
      '--verify',
      '--quiet',
      `refs/remotes/${remote}/${BACKLOG_BRANCH}^{commit}`,
    ])
    if (fetched !== undefined) {
      return fetched.trim()
    }
  }
  return tryGit(options.root, ['rev-parse', '--verify', '--quiet', `refs/heads/${BACKLOG_BRANCH}^{commit}`])?.trim()
}

/** Every file on the backlog branch, by repo-relative path. Empty when the branch does not exist. */
export const readStore = (options: StoreOptions): Map<string, string> => {
  const files = new Map<string, string>()
  const tip = backlogTip(options)
  if (tip === undefined) {
    return files
  }
  const paths = git(options.root, ['ls-tree', '-r', '--name-only', '-z', tip])
    .split('\0')
    .filter((path) => path.length > 0)
  for (const path of paths) {
    files.set(path, git(options.root, ['show', `${tip}:${path}`]))
  }
  return files
}

const authorEnv = (root: string): NodeJS.ProcessEnv => {
  if (tryGit(root, ['config', '--get', 'user.email']) !== undefined) {
    return {}
  }
  return {
    GIT_AUTHOR_NAME: 'design-process',
    GIT_AUTHOR_EMAIL: 'design-process@localhost',
    GIT_COMMITTER_NAME: 'design-process',
    GIT_COMMITTER_EMAIL: 'design-process@localhost',
  }
}

/**
 * Commit `files` as the whole content of the backlog branch and push it, without touching the
 * working tree or the checked-out branch. Creates the branch orphan when it does not exist.
 */
export const writeStore = (options: StoreOptions, files: Map<string, string>, message: string): string => {
  const { root } = options
  const tip = backlogTip(options)
  const indexDir = mkdtempSync(join(tmpdir(), 'design-process-backlog-'))
  const env = { ...authorEnv(root), GIT_INDEX_FILE: join(indexDir, 'index') }
  try {
    if (tip !== undefined) {
      git(root, ['read-tree', tip], env)
      const existing = git(root, ['ls-tree', '-r', '--name-only', '-z', tip])
        .split('\0')
        .filter((path) => path.length > 0)
      for (const path of existing.filter((candidate) => !files.has(candidate))) {
        git(root, ['update-index', '--force-remove', path], env)
      }
    }
    for (const [path, content] of files) {
      const blob = execFileSync('git', ['-C', root, 'hash-object', '-w', '--stdin'], {
        encoding: 'utf8',
        input: content,
      }).trim()
      git(root, ['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`], env)
    }
    const tree = git(root, ['write-tree'], env).trim()
    const commit = git(
      root,
      ['commit-tree', tree, ...(tip === undefined ? [] : ['-p', tip]), '-m', message],
      env,
    ).trim()
    git(root, ['update-ref', `refs/heads/${BACKLOG_BRANCH}`, commit], env)
    if (options.push !== false && hasRemote(options)) {
      git(root, ['push', remoteName(options), `refs/heads/${BACKLOG_BRANCH}:refs/heads/${BACKLOG_BRANCH}`])
    }
    return commit
  } finally {
    rmSync(indexDir, { recursive: true, force: true })
  }
}
