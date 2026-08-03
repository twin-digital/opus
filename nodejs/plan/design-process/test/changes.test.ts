import { writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { GitTree } from '../src/tree.js'
import { validateTree } from '../src/validate.js'
import { demoCoverage, demoProduct, makeGitRepo, yaml } from './helpers.js'

import type { Finding } from '../src/types.js'

const rules = (findings: Finding[]): string[] => findings.map((finding) => finding.rule)

const checkAgainstMain = (root: string, tree: ReturnType<typeof makeGitRepo>['tree']): Finding[] =>
  validateTree(tree, { base: new GitTree(root, 'main') })

const write = (root: string, path: string, content: string): void => {
  mkdirSync(join(root, dirname(path)), { recursive: true })
  writeFileSync(join(root, path), content)
}

describe('validateTree — change rules', () => {
  it('passes an unchanged tree', () => {
    const { root, tree } = makeGitRepo(demoProduct())
    expect(checkAgainstMain(root, tree)).toEqual([])
  })

  it('fails an edit to a published increment (r-caao9k3z)', () => {
    const { root, tree } = makeGitRepo(demoProduct())
    write(
      root,
      'products/demo/increments/001/decisions.yaml',
      yaml({ version: '1', decisions: [{ id: 'd-aaaaaaaa', statement: 'rewritten\n', status: 'accepted' }] }),
    )
    expect(rules(checkAgainstMain(root, tree))).toContain('published-immutable')
  })

  it('fails a file added to a published increment (r-caao9k3z)', () => {
    const { root, tree } = makeGitRepo(demoProduct())
    write(root, 'products/demo/increments/001/drafts/late.md', 'late addition\n')
    expect(rules(checkAgainstMain(root, tree))).toContain('published-immutable')
  })

  it('fails a file deleted from a published increment (r-caao9k3z)', () => {
    const { root, tree } = makeGitRepo(demoProduct())
    rmSync(join(root, 'products/demo/increments/002/decisions.yaml'))
    expect(rules(checkAgainstMain(root, tree))).toContain('published-immutable')
  })

  it('accepts a new increment extending the sequence', () => {
    const { root, tree } = makeGitRepo(demoProduct())
    write(
      root,
      'products/demo/increments/003/decisions.yaml',
      yaml({ version: '1', decisions: [{ id: 'd-gggggggg', statement: 'new\n', status: 'accepted' }] }),
    )
    expect(checkAgainstMain(root, tree)).toEqual([])
  })

  it('fails an edit to a bound schema pool version (r-2fytqadu)', () => {
    const { root, tree } = makeGitRepo(demoProduct())
    // product@1 is bound by every product.yaml's version field
    write(
      root,
      'schemas/design-process/product.1.yaml',
      '$schema: https://json-schema.org/draft/2020-12/schema\n$id: /design-process/product@1\ntype: object\n',
    )
    expect(rules(checkAgainstMain(root, tree))).toContain('pool-version-immutable')
  })

  it('fails removing a schema version bound transitively through $ref (r-2fytqadu)', () => {
    const { root, tree } = makeGitRepo(demoProduct())
    // common@1 is bound only through $refs from the source schemas
    rmSync(join(root, 'schemas/design-process/common.1.yaml'))
    expect(rules(checkAgainstMain(root, tree))).toContain('pool-version-immutable')
  })

  it('accepts moving a bound schema file when its content is unchanged', () => {
    const { root, tree } = makeGitRepo(demoProduct())
    const content = tree.read('schemas/design-process/common.1.yaml')
    rmSync(join(root, 'schemas/design-process/common.1.yaml'))
    write(root, 'schemas/shared/common.1.yaml', content)
    expect(checkAgainstMain(root, tree)).toEqual([])
  })

  it('accepts editing an unbound pool version', () => {
    const files = demoProduct()
    files['schemas/demo/unbound.1.yaml'] =
      '$schema: https://json-schema.org/draft/2020-12/schema\n$id: /demo/unbound@1\ntype: object\n'
    const { root, tree } = makeGitRepo(files)
    write(
      root,
      'schemas/demo/unbound.1.yaml',
      '$schema: https://json-schema.org/draft/2020-12/schema\n$id: /demo/unbound@1\ntype: string\n',
    )
    expect(checkAgainstMain(root, tree)).toEqual([])
  })

  it('fails an edit to a shipped implementation record (d-0hedq82d)', () => {
    const files = demoProduct()
    files['implementations/demo/002-1.yaml'] = yaml({
      version: '1',
      product: 'demo',
      target: 2,
      packages: [{ path: 'nodejs/demo', version: '1.0.0' }],
      coverage: demoCoverage(),
    })
    const { root, tree } = makeGitRepo(files)
    write(
      root,
      'implementations/demo/002-1.yaml',
      tree.read('implementations/demo/002-1.yaml').replace('1.0.0', '1.0.1'),
    )
    expect(rules(checkAgainstMain(root, tree))).toContain('record-immutable')
  })

  it('fails a new record not targeting the newest published increment (d-ki941p9b)', () => {
    const { root, tree } = makeGitRepo(demoProduct())
    write(
      root,
      'implementations/demo/001-1.yaml',
      yaml({
        version: '1',
        product: 'demo',
        target: 1,
        packages: [{ path: 'nodejs/demo', version: '1.0.0' }],
        coverage: [{ claim: 'r-bbbbbbbb', covered_by: [{ kind: 'attestation' }] }],
      }),
    )
    expect(rules(checkAgainstMain(root, tree))).toContain('record-target-newest')
  })

  it('accepts a new record targeting the newest published increment', () => {
    const { root, tree } = makeGitRepo(demoProduct())
    write(
      root,
      'implementations/demo/002-1.yaml',
      yaml({
        version: '1',
        product: 'demo',
        target: 2,
        packages: [{ path: 'nodejs/demo', version: '1.0.0' }],
        coverage: demoCoverage(),
      }),
    )
    expect(checkAgainstMain(root, tree)).toEqual([])
  })
})
