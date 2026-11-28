import type { InputOutcome } from '@thrashplay/wishem-renderer-react'

const REFUSED = 'The workbench refused the change.'

/** The text that tells the designer why the workbench did not accept an input. */
export const outcomeText = (outcome: Extract<InputOutcome, { ok: false }>): string => {
  switch (outcome.reason) {
    case 'not-running':
      return 'The workbench does not run. Start it, and try again.'
    case 'unknown':
      return 'The connection ended before an answer. Look at the title after it connects.'
    case 'not-permitted':
      return 'This page cannot send changes.'
    case 'failed':
      return 'The workbench failed to apply the change.'
    case 'invalid':
      return outcome.problems[0]?.message ?? REFUSED
    case 'unknown-type':
      return REFUSED
  }
}
