import { execFileSync } from 'node:child_process'

export type GitShowResult = { readonly ok: true; readonly content: string } | { readonly ok: false }

/**
 * `git show <ref>:<path>`. `ok: false` means the path does **not exist** at `ref` (a new file) —
 * deliberately distinct from *present-but-unparseable*, which is `ok: true` with content that a
 * later `JSON.parse`/`yaml.parse` rejects. Callers must branch on `ok`, never on empty content.
 */
export const gitShow = (ref: string, path: string): GitShowResult => {
  try {
    return { ok: true, content: execFileSync('git', ['show', `${ref}:${path}`], { encoding: 'utf8' }) }
  } catch {
    return { ok: false }
  }
}

/** Absolute path to the repository root, so the tool works regardless of the process's cwd. */
export const repoRoot = (): string => execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()

/** Best-effort fetch so `origin/<ref>` resolves; the workflow also fetches, so failures are ignored. */
export const gitFetch = (ref: string): void => {
  try {
    execFileSync('git', ['fetch', 'origin', ref], { stdio: 'ignore' })
  } catch {
    /* already fetched by the workflow */
  }
}
