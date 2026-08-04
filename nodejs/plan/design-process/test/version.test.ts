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

describe('parseFoldVersion — d-0lkxin7b', () => {
  it('reads exactly three digits as an increment number', () => {
    expect(parseFoldVersion('009')).toEqual({ kind: 'increment', number: 9 })
    expect(parseFoldVersion('011')).toEqual({ kind: 'increment', number: 11 })
    expect(parseFoldVersion('000')).toEqual({ kind: 'increment', number: 0 })
  })

  it('reads anything else as a git ref', () => {
    for (const value of ['main', 'HEAD', '9', '0009', 'abc1234', 'origin/main', 'v1.0.0']) {
      expect(parseFoldVersion(value)).toEqual({ kind: 'ref', ref: value })
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

  it('folds the working tree at the increment a three-digit version names', () => {
    const resolved = resolveFold(repo(), 'demo', parseFoldVersion('001'))
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
    expect(resolveFold(root, 'demo', parseFoldVersion(before)).at).toBe(2)
    expect(resolveFold(root, 'demo', parseFoldVersion(before)).fold.requirements.has('r-dddddddd')).toBe(false)
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
