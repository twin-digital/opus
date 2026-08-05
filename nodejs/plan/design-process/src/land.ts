import type { OpenEntry } from './session/entries.js'
import type { Staged } from './session/staging.js'
import type { FileTree } from './tree.js'

/**
 * The landing sequence, in the order it runs (d-qzpfyc6s). The approval follows the push, because
 * a push after an approval dismisses it.
 */
export const LAND_STEPS = ['apply', 'conflicts', 'rename', 'check', 'commit', 'push', 'approve', 'auto-merge'] as const

export type LandStep = (typeof LAND_STEPS)[number]

export interface StepResult {
  step: LandStep
  status: 'ok' | 'failed' | 'skipped'
  /** What ran, or what to fix when it failed. */
  detail?: string
}

/** Runs one command and returns its stdout; throws with the output when it exits non-zero. */
export type CommandRunner = (command: string, args: string[], options?: { cwd?: string }) => string

export interface PullRequest {
  owner: string
  repo: string
  number: number
}

export interface LandOptions {
  root: string
  product: string
  /** Rulings the session took and has not written; the non-interactive command carries none. */
  staged?: { entries: OpenEntry[]; staged: Staged }
  /**
   * Asked for the owner's approving token when the sequence reaches the approval, and never
   * before. Returning undefined publishes everything up to the approval and reports the pull
   * request as awaiting it (d-6fur4w53).
   */
  approvingToken?: () => Promise<string | undefined>
  /** Injected by the tests; defaults to spawning the real command. */
  run?: CommandRunner
  /** Injected by the tests; defaults to the GitHub API call carrying the token in a header. */
  approve?: (token: string, pullRequest: PullRequest) => Promise<void>
}

export interface LandResult {
  steps: StepResult[]
  landed: boolean
  /** The number the landing claimed, zero-padded. */
  number?: string
  /** Set when the sequence published but the approval was not given. */
  awaitingApproval?: boolean
}

/**
 * What refuses a landing before any step runs: a decision still proposed, or a question still
 * open, in any increment the landing would publish.
 */
export const landingBlockers = (_tree: FileTree, _productId: string): string[] => {
  throw new Error('not implemented')
}

/**
 * Run the landing sequence in order, stopping at the first step that fails and reporting what to
 * fix. Nothing in it needs judgement, so the interactive session and `design-process land` run the
 * same function.
 */
export const landIncrement = (_options: LandOptions): Promise<LandResult> => {
  throw new Error('not implemented')
}
