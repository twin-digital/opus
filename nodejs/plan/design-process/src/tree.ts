import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** A read-only view of a repository tree, by working directory or by git ref. Paths are repo-relative, posix-style. */
export interface FileTree {
  paths(): string[]
  read(path: string): string
  has(path: string): boolean
}

const IGNORED_DIRS = new Set(['.git', 'node_modules'])

export class DirTree implements FileTree {
  private cached: string[] | undefined
  // declared and assigned rather than a parameter property: the in-repo bin runs this source
  // through node's type stripping, which does not support them
  readonly root: string

  constructor(root: string) {
    this.root = root
  }

  paths(): string[] {
    if (this.cached === undefined) {
      const walk = (dir: string, prefix: string): string[] =>
        readdirSync(join(this.root, dir), { withFileTypes: true }).flatMap((entry) => {
          if (entry.isDirectory()) {
            return IGNORED_DIRS.has(entry.name) ? [] : walk(join(dir, entry.name), `${prefix}${entry.name}/`)
          }
          return entry.isFile() ? [`${prefix}${entry.name}`] : []
        })
      this.cached = walk('.', '')
    }
    return this.cached
  }

  read(path: string): string {
    return readFileSync(join(this.root, path), 'utf8')
  }

  has(path: string): boolean {
    return this.paths().includes(path)
  }
}

export class GitTree implements FileTree {
  private cached: string[] | undefined

  readonly root: string
  readonly ref: string

  constructor(root: string, ref: string) {
    this.root = root
    this.ref = ref
  }

  paths(): string[] {
    this.cached ??= execFileSync('git', ['-C', this.root, 'ls-tree', '-r', '--name-only', '-z', this.ref], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
      .split('\0')
      .filter((path) => path.length > 0)
    return this.cached
  }

  read(path: string): string {
    return execFileSync('git', ['-C', this.root, 'show', `${this.ref}:${path}`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
  }

  has(path: string): boolean {
    return this.paths().includes(path)
  }
}

export const resolveGitRef = (root: string, candidates: string[]): string | undefined => {
  for (const candidate of candidates) {
    try {
      execFileSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', `${candidate}^{commit}`], {
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      return candidate
    } catch {
      // not a resolvable ref; try the next candidate
    }
  }
  return undefined
}
