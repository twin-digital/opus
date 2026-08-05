import type { PullRequest } from '../land.js'

/**
 * What the session runs against once the pull request is resolved: the tree it reads and writes,
 * the draft it opens on, and where that draft lives (d-7i1l1kfy, d-pm6a29v6).
 */
export interface SessionTarget {
  /** The tree the session works in — the current one, or a temporary worktree made from the head. */
  root: string
  /** The product the chosen draft belongs to, read from `products/<product>/` above its directory. */
  product: string
  /** The draft increment directory the session opens on. */
  increment: string
  branch: string
  pullRequest: PullRequest
  /** Removes the worktree the session materialised; a no-op where it worked in place. */
  release: () => void
}

/** A draft the pull request's diff carries, for the select-draft screen (d-pm6a29v6). */
export interface DraftChoice {
  product: string
  increment: string
}

/** The session refuses to open, saying which (d-7i1l1kfy). */
export type TargetRefusal =
  | { reason: 'default-branch'; branch: string }
  | { reason: 'no-draft' }
  | { reason: 'uncommitted-changes' }
  | { reason: 'unpushable-fork'; branch: string }
  | { reason: 'no-increment-on-pull-request'; pullRequest: PullRequest }

export interface TargetOptions {
  /** The directory the command ran in; the local clone is found from it. */
  root: string
  /** `--pr <url>`; absent means the branch the working directory is on. */
  pr?: string
  /** `[product]`; narrows the drafts the pull request's diff carries. */
  product?: string
  /** Asked only where the diff carries several drafts after the product narrows them. */
  choose?: (choices: DraftChoice[]) => Promise<DraftChoice>
}

/**
 * Resolve the pull request the session works, and the draft on it. Given a url, the head branch is
 * fetched and worked in place where the tree is already on it, and in a temporary worktree
 * otherwise. Given none, the working directory's branch supplies the pull request, and one is
 * opened where the branch has none.
 */
export const resolveSessionTarget = async (
  _options: TargetOptions,
): Promise<SessionTarget | { refused: TargetRefusal }> => {
  await Promise.resolve()
  throw new Error('design-process: resolving a session from its pull request is not built yet')
}
