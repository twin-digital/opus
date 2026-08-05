import type { SessionState } from './model.js'

export interface Viewport {
  rows: number
  columns: number
}

/**
 * The full-screen frame: the master list of open entries down the left, each with its staged
 * ruling beside it, and the selected entry in full down the right — statement, pinning proposal,
 * what it supersedes or amends, and what it cites. Returns one string per row, unpadded.
 */
export const renderSession = (_state: SessionState, _viewport: Viewport): string[] => {
  throw new Error('not implemented')
}
