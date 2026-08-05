import { afterEach, describe, expect, it } from 'vitest'

import { findLandingConflicts, loadLandingIncrements } from '../src/conflicts.js'
import { DirTree } from '../src/tree.js'
import { validateTree } from '../src/validate.js'
import { resolveFold } from '../src/version.js'

import { demoProduct, makeRepo, removeRepo, writeFiles, yaml } from './helpers.js'

import type { Files } from './helpers.js'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    removeRepo(root)
  }
})

/** The published tree, plus a slug-named draft directory on top of it. */
const draft = (files: Files): { root: string; head: ReturnType<typeof resolveFold> } => {
  const { root } = makeRepo(demoProduct())
  roots.push(root)
  const head = resolveFold(root, 'demo')
  writeFiles(root, files)
  return { root, head }
}

describe('loadLandingIncrements', () => {
  it('reads slug-named increment directories the validator skips', () => {
    const { root } = draft({
      'products/demo/increments/faster-thing/decisions.yaml': yaml({
        version: '1',
        decisions: [{ id: 'd-eeeeeeee', statement: 'a draft ruling.\n', status: 'accepted' }],
      }),
    })
    const increments = loadLandingIncrements(new DirTree(root), 'demo')
    expect(increments.map((increment) => increment.dir)).toEqual(['001', '002', 'faster-thing'])
    expect(increments.find((increment) => increment.dir === 'faster-thing')?.number).toBeUndefined()
  })
})

describe('findLandingConflicts — r-0701ctqx', () => {
  it('passes a draft whose rulings do not touch the head', () => {
    const { root, head } = draft({
      'products/demo/increments/faster-thing/decisions.yaml': yaml({
        version: '1',
        decisions: [{ id: 'd-eeeeeeee', statement: 'a fresh ruling.\n', status: 'accepted' }],
      }),
    })
    expect(findLandingConflicts(new DirTree(root), head, 'demo')).toEqual([])
  })

  it('flags a draft superseding an entry the head has already closed', () => {
    const { root, head } = draft({
      'products/demo/increments/faster-thing/decisions.yaml': yaml({
        version: '1',
        decisions: [
          { id: 'd-eeeeeeee', statement: 'ruling on the same choice.\n', status: 'accepted', supersedes: 'd-aaaaaaaa' },
        ],
      }),
    })
    const findings = findLandingConflicts(new DirTree(root), head, 'demo')
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      rule: 'landing-already-closed',
      claims: ['r-0701ctqx'],
      path: 'products/demo/increments/faster-thing/decisions.yaml',
    })
    expect(findings[0]?.message).toContain('d-aaaaaaaa')
  })

  it('flags a draft retiring an entry the head has already retired', () => {
    const { root, head } = draft({
      'products/demo/increments/faster-thing/requirements.yaml': yaml({
        version: '1',
        retires: [{ id: 'r-aaaaaaaa', reason: 'gone' }],
      }),
    })
    expect(findLandingConflicts(new DirTree(root), head, 'demo').map((finding) => finding.rule)).toEqual([
      'landing-already-closed',
    ])
  })

  it('flags a draft declaring an id the head already declares', () => {
    const { root, head } = draft({
      'products/demo/increments/faster-thing/requirements.yaml': yaml({
        version: '1',
        requirements: [{ id: 'r-bbbbbbbb', statement: 'a second declaration of one id.\n' }],
      }),
    })
    expect(findLandingConflicts(new DirTree(root), head, 'demo').map((finding) => finding.rule)).toEqual([
      'landing-duplicate-id',
    ])
  })

  it('covers a draft increment at its wip directory (d-x0q4xgd8)', () => {
    const { root, head } = draft({
      'products/demo/increments/wip-003-faster-thing/requirements.yaml': yaml({
        version: '1',
        requirements: [{ id: 'r-bbbbbbbb', statement: 'a second declaration of one id.\n' }],
      }),
    })
    expect(findLandingConflicts(new DirTree(root), head, 'demo').map((finding) => finding.rule)).toEqual([
      'landing-duplicate-id',
    ])
  })

  it('ignores increments already published at the head', () => {
    const { root, head } = draft({})
    expect(findLandingConflicts(new DirTree(root), head, 'demo')).toEqual([])
  })
})

describe('the name finding is what keeps a draft out of main — d-1qn5jzgd', () => {
  const slugTree = (): string => {
    const { root } = makeRepo(demoProduct())
    roots.push(root)
    writeFiles(root, {
      'products/demo/increments/faster-thing/decisions.yaml': yaml({
        version: '1',
        decisions: [{ id: 'd-eeeeeeee', statement: 'a draft ruling.\n', status: 'accepted' }],
      }),
    })
    return root
  }

  it('still refuses a slug-named increment directory with the name finding', () => {
    const findings = validateTree(new DirTree(slugTree()), {})
    const name = findings.filter((finding) => finding.rule === 'increment-dir-name')
    expect(name).toHaveLength(1)
    expect(name[0]?.message).toContain('"faster-thing"')
    expect(name[0]?.claims).toEqual(['d-34t7y2iq'])
  })

  it('clears the finding once the landing rename numbers the directory', () => {
    const { root } = makeRepo(demoProduct())
    roots.push(root)
    writeFiles(root, {
      'products/demo/increments/003/decisions.yaml': yaml({
        version: '1',
        decisions: [{ id: 'd-eeeeeeee', statement: 'a landed ruling.\n', status: 'accepted' }],
      }),
    })
    expect(validateTree(new DirTree(root), {}).filter((finding) => finding.rule === 'increment-dir-name')).toEqual([])
  })
})
