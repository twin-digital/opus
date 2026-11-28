import { describe, expect, it } from 'vitest'
import * as root from './index.js'

describe('the root entry', () => {
  it('exports the renderer, the table of views, the warnings, the sidecar, the names of props, and the stub of the tools', () => {
    expect(Object.keys(root).sort()).toEqual([
      'REACT_KIND',
      'RESERVED_PROP_NAMES',
      'Renderer',
      'ViewCollectionError',
      'collectViews',
      'describeWarning',
      'fieldName',
      'holdWarnings',
      'parseSidecar',
      'propNames',
      'stubViewTools',
      'viewWarnings',
    ])
  })

  it('exports nothing of the generator', () => {
    expect(root).not.toHaveProperty('generateViewTypes')
    expect(root).not.toHaveProperty('renderViewTypes')
    expect(root).not.toHaveProperty('viewTypesLines')
  })
})
