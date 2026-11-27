import { describe, expect, it } from 'vitest'
import * as root from './index.js'

describe('the root entry', () => {
  it('exports the renderer, the table of views, the warnings, the sidecar, and the names of props', () => {
    expect(Object.keys(root).sort()).toEqual([
      'REACT_KIND',
      'Renderer',
      'ViewCollectionError',
      'collectViews',
      'describeWarning',
      'fieldName',
      'parseSidecar',
      'propNames',
      'viewWarnings',
    ])
  })

  it('exports nothing of the generator', () => {
    expect(root).not.toHaveProperty('generateViewTypes')
    expect(root).not.toHaveProperty('renderViewTypes')
    expect(root).not.toHaveProperty('viewTypesLines')
  })
})
