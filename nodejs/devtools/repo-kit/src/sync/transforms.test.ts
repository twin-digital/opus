import { describe, it, expect } from 'vitest'

import { transforms } from './transforms.js'

describe('transforms.strip-package-version', () => {
  const stripPackageVersion = transforms['strip-package-version']

  it.each([
    ['ink', 'ink'],
    ['lodash-es@4.17.21', 'lodash-es'],
    ['@mishieck/ink-titled-box@0.3.0', '@mishieck/ink-titled-box'],
    ['@scope/name', '@scope/name'],
    ['@scope/name@1.2.3', '@scope/name'],
    ['pkg@1.0.0-beta.1', 'pkg'],
  ])('reduces %j to %j', (input, expected) => {
    expect(stripPackageVersion([input])).toEqual([expected])
  })

  it('maps every element of the array', () => {
    expect(stripPackageVersion(['ink', '@mishieck/ink-titled-box@0.3.0', 'lodash-es@4.17.21'])).toEqual([
      'ink',
      '@mishieck/ink-titled-box',
      'lodash-es',
    ])
  })
})

describe('transforms.strip-scope', () => {
  const stripScope = transforms['strip-scope']

  it.each([
    ['@twin-digital/village-guard', 'village-guard'],
    ['village-guard', 'village-guard'],
    ['@scope/nested/name', 'nested/name'],
    ['@scope/name', 'name'],
  ])('reduces %j to %j', (input, expected) => {
    expect(stripScope([input])).toEqual([expected])
  })

  it('maps every element of the array', () => {
    expect(stripScope(['@twin-digital/a', 'b', '@scope/c'])).toEqual(['a', 'b', 'c'])
  })
})
