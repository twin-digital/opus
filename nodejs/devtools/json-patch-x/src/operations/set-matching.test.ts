import jsonPatch from 'fast-json-patch'
import { describe, expect, it } from 'vitest'
import { applyPatch } from '../apply-patch.js'
import { setMatching } from './set-matching.js'

const renovateLike = () => ({
  packageRules: [
    { addLabels: ['build-scripts'], matchPackageNames: ['old'] },
    { matchManagers: ['nvm'], enabled: false },
  ],
})

describe('setMatching', () => {
  it('sets a child pointer on the element matched by `contains`', () => {
    const result = setMatching(
      renovateLike(),
      '/packageRules',
      { pointer: '/addLabels', contains: 'build-scripts' },
      '/matchPackageNames',
      ['esbuild', 'serverless'],
    )

    expect(result.packageRules[0].matchPackageNames).toEqual(['esbuild', 'serverless'])
    // unmatched elements are untouched
    expect(result.packageRules[1]).toEqual({ matchManagers: ['nvm'], enabled: false })
  })

  it('selects by value, not index — order of the array does not matter', () => {
    const document = {
      packageRules: [
        { matchManagers: ['nvm'], enabled: false },
        { addLabels: ['other'] },
        { addLabels: ['build-scripts'], matchPackageNames: ['old'] },
      ],
    }

    const result = setMatching(
      document,
      '/packageRules',
      { pointer: '/addLabels', contains: 'build-scripts' },
      '/matchPackageNames',
      ['esbuild'],
    )

    expect(result.packageRules[2].matchPackageNames).toEqual(['esbuild'])
  })

  it('updates every matching element', () => {
    const document = {
      rules: [
        { kind: 'a', value: 0 },
        { kind: 'a', value: 0 },
        { kind: 'b', value: 0 },
      ],
    }

    const result = setMatching(document, '/rules', { pointer: '/kind', equals: 'a' }, '/value', 1)

    expect(result.rules.map((r) => r.value)).toEqual([1, 1, 0])
  })

  it('supports `equals` against a scalar field', () => {
    const document = {
      rules: [
        { id: 'x', on: false },
        { id: 'y', on: false },
      ],
    }

    const result = setMatching(document, '/rules', { pointer: '/id', equals: 'y' }, '/on', true)

    expect(result.rules).toEqual([
      { id: 'x', on: false },
      { id: 'y', on: true },
    ])
  })

  it('replaces the whole element when `set` is empty', () => {
    const document = { rules: [{ id: 'x' }, { id: 'y' }] }

    const result = setMatching(document, '/rules', { pointer: '/id', equals: 'y' }, '', { id: 'y', replaced: true })

    expect(result.rules[1]).toEqual({ id: 'y', replaced: true })
  })

  it('does not mutate the input document', () => {
    const document = renovateLike()
    const snapshot = structuredClone(document)

    applyPatch(document, [
      {
        opx: 'setMatching',
        path: '/packageRules',
        where: { pointer: '/addLabels', contains: 'build-scripts' },
        set: '/matchPackageNames',
        value: ['esbuild'],
      },
    ])

    expect(document).toEqual(snapshot)
  })

  it('is reachable through applyPatch', () => {
    const result = applyPatch(renovateLike(), [
      {
        opx: 'setMatching',
        path: '/packageRules',
        where: { pointer: '/addLabels', contains: 'build-scripts' },
        set: '/matchPackageNames',
        value: ['esbuild'],
      },
    ])

    expect(result.packageRules[0].matchPackageNames).toEqual(['esbuild'])
  })

  it('throws when the predicate matches nothing (not a silent no-op)', () => {
    expect(() =>
      setMatching(
        renovateLike(),
        '/packageRules',
        { pointer: '/addLabels', contains: 'does-not-exist' },
        '/matchPackageNames',
        ['esbuild'],
      ),
    ).toThrow(jsonPatch.JsonPatchError)
  })

  it('throws when the path is not an array', () => {
    expect(() => setMatching({ packageRules: {} }, '/packageRules', { pointer: '/x', equals: 1 }, '/y', 2)).toThrow(
      /not an array/,
    )
  })

  it('throws when `where` specifies neither contains nor equals', () => {
    expect(() =>
      setMatching(renovateLike(), '/packageRules', { pointer: '/addLabels' }, '/matchPackageNames', ['esbuild']),
    ).toThrow(/exactly one/)
  })

  it('throws when `where` specifies both contains and equals', () => {
    expect(() =>
      setMatching(
        renovateLike(),
        '/packageRules',
        { pointer: '/addLabels', contains: 'build-scripts', equals: ['build-scripts'] },
        '/matchPackageNames',
        ['esbuild'],
      ),
    ).toThrow(/exactly one/)
  })
})
