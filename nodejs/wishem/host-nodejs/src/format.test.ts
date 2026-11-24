import { describe, expect, it } from 'vitest'
import type { Problem, Snapshot } from '@thrashplay/wishem-core'
import { describeCounts, formatProblem } from './format.js'

const snapshot = (definitions: number, entities: number) =>
  ({
    definitions: Array.from({ length: definitions }),
    entities: Array.from({ length: entities }),
  }) as unknown as Snapshot

describe('describeCounts', () => {
  it.each([
    [1, 1, '1 component type, 1 entity'],
    [2, 3, '2 component types, 3 entities'],
    [0, 0, '0 component types, 0 entities'],
    [1, 2, '1 component type, 2 entities'],
    [2, 1, '2 component types, 1 entity'],
  ])('describes %i component types and %i entities', (definitions, entities, text) => {
    expect(describeCounts(snapshot(definitions, entities))).toBe(text)
  })
})

describe('formatProblem', () => {
  const problem = (severity: Problem['severity'], source?: string): Problem => ({
    severity,
    message: 'the text is not valid JSON',
    path: [],
    ...(source === undefined ? {} : { source }),
  })

  it('names the file of a problem', () => {
    expect(formatProblem(problem('error', 'state.json'))).toBe(
      'wishem: problem in state.json: the text is not valid JSON',
    )
  })

  it('has no file part for a problem with no source', () => {
    expect(formatProblem(problem('error'))).toBe('wishem: problem: the text is not valid JSON')
  })

  it('names a warning', () => {
    expect(formatProblem(problem('warning', 'definitions/a.json'))).toBe(
      'wishem: warning in definitions/a.json: the text is not valid JSON',
    )
    expect(formatProblem(problem('warning'))).toBe('wishem: warning: the text is not valid JSON')
  })
})
