import type { Problem, Snapshot } from '@thrashplay/wishem-core'

/** For example `1 component type, 2 entities`. */
export const describeCounts = ({ definitions, entities }: Snapshot): string =>
  `${definitions.length} ${definitions.length === 1 ? 'component type' : 'component types'}, ` +
  `${entities.length} ${entities.length === 1 ? 'entity' : 'entities'}`

/** For example `wishem: problem in state.json: the text is not valid JSON`. */
export const formatProblem = (problem: Problem): string => {
  const kind = problem.severity === 'error' ? 'problem' : 'warning'
  return `wishem: ${kind}${problem.source === undefined ? '' : ` in ${problem.source}`}: ${problem.message}`
}
