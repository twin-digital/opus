import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** The branch the backlog lives on; orphan, never merged. */
export const BACKLOG_BRANCH = 'backlog'

export interface StoreOptions {
  root: string
  remote?: string
  /** Skip the fetch that refreshes the local view of the branch on the first read. */
  offline?: boolean
  /** Push the commit to the remote. Default true; a repo with no such remote skips it. */
  push?: boolean
  /** How many times to rebuild against a refreshed tip after a rejected push. Default 3. */
  retries?: number
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

const treePaths = (root: string, tip: string): string[] =>
  git(root, ['ls-tree', '-r', '--name-only', '-z', tip])
    .split('\0')
    .filter((path) => path.length > 0)

/** Every file in `tip`, by repo-relative path. Empty when there is no commit. */
const readStoreAt = (root: string, tip: string | undefined): Map<string, string> => {
  const files = new Map<string, string>()
  if (tip === undefined) {
    return files
  }
  for (const path of treePaths(root, tip)) {
    files.set(path, git(root, ['show', `${tip}:${path}`]))
  }
  return files
}

/** Every file on the backlog branch, by repo-relative path. Empty when the branch does not exist. */
export const readStore = (options: StoreOptions): Map<string, string> => readStoreAt(options.root, backlogTip(options))

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

/** Build the commit for `files` on top of `tip` and move the branch to it. */
const commitStore = (root: string, tip: string | undefined, files: Map<string, string>, message: string): string => {
  const indexDir = mkdtempSync(join(tmpdir(), 'design-process-backlog-'))
  const env = { ...authorEnv(root), GIT_INDEX_FILE: join(indexDir, 'index') }
  try {
    if (tip !== undefined) {
      git(root, ['read-tree', tip], env)
      for (const path of treePaths(root, tip).filter((candidate) => !files.has(candidate))) {
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
    return commit
  } finally {
    rmSync(indexDir, { recursive: true, force: true })
  }
}

/** Put the branch back where it was, so a rejected commit leaves no trace locally. */
const restoreRef = (root: string, tip: string | undefined): void => {
  tryGit(
    root,
    tip === undefined ?
      ['update-ref', '-d', `refs/heads/${BACKLOG_BRANCH}`]
    : ['update-ref', `refs/heads/${BACKLOG_BRANCH}`, tip],
  )
}

export interface StoreChange<T> {
  files: Map<string, string>
  /** Omitted when the change is a no-op: nothing is committed and nothing pushed. */
  message?: string
  result: T
}

/**
 * Apply `change` to the backlog's files and commit the result, without touching the working tree
 * or the checked-out branch. Creates the branch orphan when it does not exist.
 *
 * A concurrent push that moves the branch between the read and the push rejects the push; the
 * branch goes back where it was, the tip is refetched, and `change` runs again over what the
 * winner left — so neither writer's item is lost. `change` must therefore be a function of the
 * files it is handed and nothing it captured earlier.
 */
export const updateStore = <T>(options: StoreOptions, change: (files: Map<string, string>) => StoreChange<T>): T => {
  const { root } = options
  const attempts = Math.max(1, (options.retries ?? 3) + 1)
  const pushes = options.push !== false && hasRemote(options)
  let rejection: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    // a retry always refetches — seeing the commit that beat us is the whole point of retrying
    const tip = backlogTip(attempt === 0 ? options : { ...options, offline: false })
    const { files, message, result } = change(readStoreAt(root, tip))
    if (message === undefined) {
      return result
    }
    commitStore(root, tip, files, message)
    if (!pushes) {
      return result
    }
    try {
      git(root, ['push', remoteName(options), `refs/heads/${BACKLOG_BRANCH}:refs/heads/${BACKLOG_BRANCH}`])
      return result
    } catch (error) {
      rejection = error
      restoreRef(root, tip)
    }
  }
  const detail = rejection instanceof Error ? rejection.message : String(rejection)
  throw new Error(
    `the ${BACKLOG_BRANCH} branch moved under this change; ${attempts} push attempt(s) rejected: ${detail}`,
  )
}
