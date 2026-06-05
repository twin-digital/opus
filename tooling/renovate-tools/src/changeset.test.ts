import { describe, expect, it } from 'vitest'
import { renderChangeset } from './changeset.js'
import { MAJOR, PATCH } from './ranges.js'

describe('renderChangeset', () => {
  it('renders a valid empty changeset when nothing is affected', () => {
    expect(renderChangeset(new Map(), 'chore(deps): bump devtools')).toBe('---\n---\n\nchore(deps): bump devtools\n')
  })

  it('renders sorted entries with bump types and the PR title as summary', () => {
    const affected = new Map([
      ['@twin-digital/b', PATCH],
      ['@twin-digital/a', MAJOR],
    ])
    expect(renderChangeset(affected, 'chore(deps): update react to v19')).toBe(
      "---\n'@twin-digital/a': major\n'@twin-digital/b': patch\n---\n\nchore(deps): update react to v19\n",
    )
  })
})
