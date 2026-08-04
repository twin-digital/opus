import { execFileSync } from 'node:child_process'

import { afterEach, describe, expect, it } from 'vitest'

import { formatIncrement, latestPublished, parseFoldVersion, resolveFold } from '../src/version.js'

import { demoProduct, makeGitRepo, removeRepo, writeFiles, yaml } from './helpers.js'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    removeRepo(root)
  }
})

const repo = (): string => {
  const { root } = makeGitRepo(demoProduct())
  roots.push(root)
  return root
}

const git = (root: string, ...args: string[]): string =>
  execFileSync('git', ['-C', root, '-c', 'user.email=t@e.com', '-c', 'user.name=t', ...args], { encoding: 'utf8' })

const names: [string, string] = ['--at', '--at-ref']

describe('parseFoldVersion — d-9y7b8qtd', () => {
  it('reads the bare parameter as an increment, padded or not', () => {
    for (const value of ['9', '09', '009']) {
      expect(parseFoldVersion({ increment: value, names })).toEqual({ kind: 'increment', number: 9 })
    }
    expect(parseFoldVersion({ increment: '11', names })).toEqual({ kind: 'increment', number: 11 })
    expect(parseFoldVersion({ increment: '0', names })).toEqual({ kind: 'increment', number: 0 })
  })

  it('reads the -ref parameter as a git ref, whatever its form', () => {
    for (const value of ['main', 'HEAD', 'abc1234', 'origin/main', 'v1.0.0', '009']) {
      expect(parseFoldVersion({ ref: value, names })).toEqual({ kind: 'ref', ref: value })
    }
  })

  it('is undefined when neither member of the pair is given', () => {
    expect(parseFoldVersion({ names })).toBeUndefined()
  })

  it('refuses both members of a pair, naming each', () => {
    expect(() => parseFoldVersion({ increment: '9', ref: 'main', names })).toThrow(/give --at or --at-ref, not both/)
  })

  it('refuses a non-numeric increment, pointing at the -ref counterpart', () => {
    for (const value of ['main', 'origin/main', 'abc1234', '9a']) {
      expect(() => parseFoldVersion({ increment: value, names })).toThrow(/--at takes an increment number/)
      expect(() => parseFoldVersion({ increment: value, names })).toThrow(/--at-ref/)
    }
  })
})

describe('latestPublished — r-tne4cdos', () => {
  it('names the highest increment the tree declares', () => {
    const root = repo()
    expect(latestPublished(resolveFold(root, 'demo').tree, 'demo')).toBe(2)
  })

  it('throws for a product the tree does not declare', () => {
    expect(() => latestPublished(resolveFold(repo(), 'demo').tree, 'absent')).toThrow(/no product/)
  })
})

describe('resolveFold', () => {
  it('folds the working tree at its newest when given no version', () => {
    expect(resolveFold(repo(), 'demo').at).toBe(2)
  })

  it('folds the working tree at the increment given', () => {
    const resolved = resolveFold(repo(), 'demo', parseFoldVersion({ increment: '1', names }))
    expect(resolved.at).toBe(1)
    expect([...resolved.fold.requirements.keys()]).toEqual(['r-aaaaaaaa', 'r-bbbbbbbb'])
  })

  it("folds a ref's tree at the newest increment published there", () => {
    const root = repo()
    const before = git(root, 'rev-parse', 'HEAD').trim()
    writeFiles(root, {
      'products/demo/increments/003/requirements.yaml': yaml({
        version: '1',
        requirements: [{ id: 'r-dddddddd', title: 'third', statement: 'a third thing.\n' }],
      }),
    })
    git(root, 'add', '-A')
    git(root, 'commit', '-m', 'increment 3')

    expect(resolveFold(root, 'demo').at).toBe(3)
    expect(resolveFold(root, 'demo', parseFoldVersion({ ref: before, names })).at).toBe(2)
    expect(
      resolveFold(root, 'demo', parseFoldVersion({ ref: before, names })).fold.requirements.has('r-dddddddd'),
    ).toBe(false)
  })
})

describe('formatIncrement', () => {
  it('zero-pads to three digits', () => {
    expect([formatIncrement(1), formatIncrement(11), formatIncrement(111), formatIncrement(1111)]).toEqual([
      '001',
      '011',
      '111',
      '1111',
    ])
  })
})
