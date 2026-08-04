import { afterEach, describe, expect, it } from 'vitest'

import { diffFolds, renderFoldDiff } from '../src/diff.js'
import { parseFoldVersion, resolveFold } from '../src/version.js'

import { demoProduct, makeRepo, removeRepo, writeFiles, yaml } from './helpers.js'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    removeRepo(root)
  }
})

const repo = (extra: Record<string, string> = {}): string => {
  const { root } = makeRepo(demoProduct())
  writeFiles(root, extra)
  roots.push(root)
  return root
}

const diffAt = (root: string, from: string, to: string) =>
  diffFolds(
    'demo',
    resolveFold(root, 'demo', parseFoldVersion(from)).fold,
    resolveFold(root, 'demo', parseFoldVersion(to)).fold,
  )

describe('diffFolds — r-v6mknsh7', () => {
  it('names the foundations a landing added', () => {
    const delta = diffAt(repo(), '001', '002')
    expect(delta.added.map((claim) => claim.id).sort()).toEqual(['d-cccccccc', 'r-cccccccc'])
    expect(delta.added.find((claim) => claim.id === 'r-cccccccc')).toMatchObject({
      kind: 'requirement',
      increment: 2,
      title: 'first, amended',
    })
  })

  it('reports an amended requirement apart from a superseded decision', () => {
    const delta = diffAt(repo(), '001', '002')
    expect(delta.amended).toEqual([{ id: 'r-aaaaaaaa', kind: 'requirement', by: 'r-cccccccc', increment: 2 }])
    expect(delta.superseded).toEqual([{ id: 'd-aaaaaaaa', kind: 'decision', by: 'd-cccccccc', increment: 2 }])
    expect(delta.retired).toEqual([])
  })

  it('reports a retirement with its recorded reason', () => {
    const root = repo({
      'products/demo/increments/003/requirements.yaml': yaml({
        version: '1',
        retires: [{ id: 'r-bbbbbbbb', reason: 'the second thing is gone' }],
      }),
    })
    const delta = diffAt(root, '002', '003')
    expect(delta.retired).toEqual([
      { id: 'r-bbbbbbbb', kind: 'requirement', by: 'the second thing is gone', increment: 3 },
    ])
    expect(delta.added).toEqual([])
  })

  it('excludes closures that happened at or before the earlier version', () => {
    const delta = diffAt(repo(), '002', '002')
    expect(delta).toMatchObject({ added: [], amended: [], superseded: [], retired: [] })
  })

  it('refuses a later version that precedes the earlier', () => {
    expect(() => diffAt(repo(), '002', '001')).toThrow(/precedes/)
  })
})

describe('renderFoldDiff', () => {
  it('heads the report with the two versions and omits empty sections', () => {
    const rendered = renderFoldDiff(diffAt(repo(), '001', '002'))
    expect(rendered).toMatch(/^# demo: 001 → 002\n/)
    expect(rendered).toContain('## added (2)')
    expect(rendered).toContain('- r-cccccccc (002) [requirement] — first, amended')
    expect(rendered).toContain('- r-aaaaaaaa (002) by r-cccccccc')
    expect(rendered).toContain('- d-aaaaaaaa (002) by d-cccccccc')
    expect(rendered).not.toContain('## retired')
  })

  it('says so when nothing changed', () => {
    expect(renderFoldDiff(diffAt(repo(), '002', '002'))).toContain('(no change)')
  })
})
