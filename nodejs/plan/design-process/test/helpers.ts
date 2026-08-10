import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { stringify } from 'yaml'

import { DirTree } from '../src/tree.js'

export type Files = Record<string, string>

/** The real design-process pool schemas, as the fixture repo's schema pool. */
export const poolFiles = (): Files => {
  const dir = join(import.meta.dirname, 'fixtures/schemas/design-process')
  const files: Files = {}
  for (const name of readdirSync(dir)) {
    files[`schemas/design-process/${name}`] = readFileSync(join(dir, name), 'utf8')
  }
  return files
}

export const yaml = (value: unknown): string => stringify(value)

export const writeFiles = (root: string, files: Files): void => {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
}

export const makeRepo = (files: Files): { root: string; tree: DirTree } => {
  const root = mkdtempSync(join(tmpdir(), 'design-process-'))
  writeFiles(root, files)
  return { root, tree: new DirTree(root) }
}

export const removeRepo = (root: string): void => {
  rmSync(root, { recursive: true, force: true })
}

const git = (root: string, ...args: string[]): void => {
  execFileSync('git', ['-C', root, '-c', 'user.email=test@example.com', '-c', 'user.name=test', ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

/** A git repo whose `main` holds `files`; mutate the working tree afterwards to exercise change rules. */
export const makeGitRepo = (files: Files): { root: string; tree: DirTree } => {
  const { root, tree } = makeRepo(files)
  git(root, 'init', '-b', 'main')
  git(root, 'add', '-A')
  git(root, 'commit', '-m', 'base')
  return { root, tree }
}

/** A minimal, valid product tree: one product, two increments, one requirement amended across them. */
export const demoProduct = (): Files => ({
  ...poolFiles(),
  'products/demo/product.yaml': yaml({
    version: '1',
    kind: 'nodejs-library',
    facets: [{ id: 'cli', description: 'the command line' }],
  }),
  'products/demo/increments/001/requirements.yaml': yaml({
    version: '1',
    requirements: [
      { id: 'r-aaaaaaaa', title: 'first', statement: 'the product does the first thing.\n' },
      { id: 'r-bbbbbbbb', title: 'second', statement: 'the product does the second thing.\n' },
    ],
    model: [{ name: 'demo-config', schema: '/design-process/product@1', description: 'a bound shape' }],
  }),
  'products/demo/increments/001/decisions.yaml': yaml({
    version: '1',
    decisions: [
      {
        id: 'd-aaaaaaaa',
        title: 'base choice',
        statement: 'the first thing is done the simple way.\n',
        status: 'accepted',
        because: ['r-aaaaaaaa'],
      },
      {
        id: 'd-bbbbbbbb',
        title: 'dependent choice',
        statement: 'the second thing builds on the first.\n',
        status: 'delegated',
        because: ['d-aaaaaaaa'],
      },
    ],
  }),
  'products/demo/increments/002/requirements.yaml': yaml({
    version: '1',
    requirements: [
      {
        id: 'r-cccccccc',
        title: 'first, amended',
        statement: 'the product does the first thing faster.\n',
        amends: 'r-aaaaaaaa',
      },
    ],
  }),
  'products/demo/increments/002/decisions.yaml': yaml({
    version: '1',
    decisions: [
      {
        id: 'd-cccccccc',
        title: 'replacement choice',
        statement: 'the first thing is done the fast way.\n',
        status: 'tolerated',
        supersedes: 'd-aaaaaaaa',
      },
    ],
  }),
})

/** demoProduct with increment 002's decisions as a version-2 source carrying a deferred entry. */
export const demoWithDeferred = (): Files => {
  const files = demoProduct()
  files['products/demo/increments/002/decisions.yaml'] = yaml({
    version: '2',
    decisions: [
      {
        id: 'd-cccccccc',
        title: 'replacement choice',
        statement: 'the first thing is done the fast way.\n',
        status: 'tolerated',
        supersedes: 'd-aaaaaaaa',
      },
      {
        id: 'd-dddddddd',
        title: 'third thing, deferred',
        statement: 'how the third thing is done awaits its answer.\n',
        status: 'deferred',
      },
    ],
  })
  return files
}

/**
 * A minimal, valid product on the 032–034 dialects: a `requirements@3` source carrying
 * components, terms, and `requirement@2` entries, and a `decisions@3` source with `decision@3`
 * entries — scope, commentary, and cases included.
 */
export const demoV3 = (): Files => ({
  ...poolFiles(),
  'products/demo3/product.yaml': yaml({
    version: '2',
    kind: 'nodejs-library',
    packages: [{ path: 'nodejs/demo3', kind: 'npm-library', component: 'engine' }],
  }),
  'products/demo3/increments/001/requirements.yaml': yaml({
    version: '3',
    components: [
      { id: 'engine', description: 'the core engine' },
      { id: 'parser', description: 'the input parser', parent: 'engine' },
    ],
    terms: [{ id: 'fold', definition: 'the effective state of a product at an increment' }],
    requirements: [
      {
        id: 'r-aaaaaaaa',
        title: 'first',
        statement: 'the product does the first thing.\n',
        scope: 'engine',
        commentary: 'the owner reverses designs over this.\n',
      },
      { id: 'r-bbbbbbbb', title: 'second', statement: 'the product does the second thing.\n' },
    ],
    model: [{ name: 'demo-config', schema: '/design-process/product@1', description: 'a bound shape' }],
  }),
  'products/demo3/increments/001/decisions.yaml': yaml({
    version: '3',
    decisions: [
      {
        id: 'd-aaaaaaaa',
        title: 'base choice',
        statement: 'the first thing is done the simple way.\n',
        status: 'accepted',
        because: ['r-aaaaaaaa'],
        scope: 'parser',
        commentary: 'reads better as branches.\n',
        cases: [{ when: 'the input is well-formed', then: 'it is parsed' }, { otherwise: 'the line is reported' }],
      },
    ],
  }),
})

/** Coverage for every claim in force at demo increment 2 — records must be complete. */
export const demoCoverage = (): { claim: string; covered_by: { kind: string }[] }[] =>
  ['r-bbbbbbbb', 'r-cccccccc', 'd-bbbbbbbb', 'd-cccccccc'].map((claim) => ({
    claim,
    covered_by: [{ kind: 'attestation' }],
  }))
