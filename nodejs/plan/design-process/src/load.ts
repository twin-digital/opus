import { parse } from 'yaml'

import type { FileTree } from './tree.js'
import type {
  DecisionsSource,
  Finding,
  ImplementationRecord,
  ProductDeclaration,
  QuestionsSource,
  RequirementsSource,
} from './types.js'

export type SourceKind = 'requirements' | 'decisions' | 'questions'

export interface SourceFile<T> {
  path: string
  data: T
}

/** The sources one increment directory holds, published or draft. */
export interface IncrementSources {
  dir: string
  requirements?: SourceFile<RequirementsSource>
  decisions?: SourceFile<DecisionsSource>
  questions?: SourceFile<QuestionsSource>
}

/** A published increment: its directory is the zero-padded number it claims. */
export interface Increment extends IncrementSources {
  number: number
}

/**
 * A draft increment in flight at `wip-<NNN>-<slug>/` (d-x0q4xgd8). The ordinal orders the drafts
 * a tree holds and claims no published number.
 */
export interface DraftIncrement extends IncrementSources {
  ordinal: number
  /** The directory name, which is how a draft increment shows until it lands. */
  name: string
}

export interface RecordFile {
  path: string
  /** Parsed from the `<NNN>-<k>` filename; undefined when the name does not follow the convention. */
  fileTarget?: number
  fileOrdinal?: number
  data: ImplementationRecord
}

export interface Product {
  id: string
  /** The product root: the directory holding product.yaml, at any depth under products/. */
  dir: string
  declaration?: SourceFile<ProductDeclaration>
  /** Published increments, ascending. */
  increments: Increment[]
  /** Draft increments in flight, in ordinal order; empty on any tree that has landed its drafts. */
  drafts: DraftIncrement[]
  records: RecordFile[]
}

export interface ProductsTree {
  products: Map<string, Product>
  findings: Finding[]
}

const SOURCE_FILE = /^(requirements|decisions|questions)\.ya?ml$/
const INCREMENT_DIR = /^\d{3,}$/
/** A product declaration, at any depth under products/ (d-34t7y2iq). */
const DECLARATION = /^products\/(.+)\/product\.ya?ml$/
/** An increment source under some product root, however deep the root sits. */
const INCREMENT_SOURCE = /^products\/(.+)\/increments\/([^/]+)\/([^/]+)$/
/** A draft increment directory: `wip-`, a three-digit ordinal, and a slug (d-x0q4xgd8). */
export const WIP_DIR = /^wip-(\d{3})-([a-z0-9]+(?:-[a-z0-9]+)*)$/
const RECORD_FILE = /^(\d{3,})-(\d+)\.ya?ml$/

const parseYaml = (tree: FileTree, path: string, findings: Finding[]): unknown => {
  try {
    return parse(tree.read(path))
  } catch (error) {
    findings.push({
      rule: 'source-parse',
      claims: ['r-gq90gngs'],
      path,
      message: `not parseable as YAML: ${error instanceof Error ? error.message : String(error)}`,
    })
    return undefined
  }
}

/**
 * The product roots a tree declares: the directory of every `product.yaml` under `products/`, at
 * any depth, less those nested inside another root — the scan stops at a root and does not descend
 * into it, so a declaration inside a product's own tree declares nothing (d-34t7y2iq).
 */
const findRoots = (tree: FileTree, findings: Finding[]): { dir: string; path: string }[] => {
  const declarations = tree
    .paths()
    .filter((path) => DECLARATION.test(path))
    .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))
  const roots: { dir: string; path: string }[] = []
  for (const path of declarations) {
    const dir = path.slice(0, path.lastIndexOf('/'))
    const owner = roots.find((root) => dir === root.dir || dir.startsWith(`${root.dir}/`))
    if (owner?.dir === dir) {
      findings.push({
        rule: 'product-id-unique',
        claims: ['d-34t7y2iq'],
        path,
        message: `${dir} is already declared by ${owner.path}`,
      })
      continue
    }
    if (owner === undefined) {
      roots.push({ dir, path })
    }
  }
  return roots
}

/** Load `products/**` and `implementations/**` into per-product structures. */
export const loadProducts = (tree: FileTree): ProductsTree => {
  const findings: Finding[] = []
  const products = new Map<string, Product>()
  /** Every product root, whether or not it claimed its id — an increment under one is never orphaned. */
  const roots = new Map<string, Product | undefined>()

  for (const root of findRoots(tree, findings)) {
    const id = root.dir.slice(root.dir.lastIndexOf('/') + 1)
    const claimed = products.get(id)
    if (claimed) {
      findings.push({
        rule: 'product-id-unique',
        claims: ['d-34t7y2iq', 'r-jx6uk0bs'],
        path: root.path,
        message: `product id ${JSON.stringify(id)} is already declared at ${claimed.dir}`,
      })
      roots.set(root.dir, undefined)
      continue
    }
    const data = parseYaml(tree, root.path, findings)
    const entry: Product = {
      id,
      dir: root.dir,
      declaration: data === undefined ? undefined : { path: root.path, data: data as ProductDeclaration },
      increments: [],
      drafts: [],
      records: [],
    }
    products.set(id, entry)
    roots.set(root.dir, entry)
  }

  /** A record filed for a product this tree does not declare still needs somewhere to be reported. */
  const product = (id: string): Product => {
    let entry = products.get(id)
    if (!entry) {
      entry = { id, dir: `products/${id}`, increments: [], drafts: [], records: [] }
      products.set(id, entry)
    }
    return entry
  }

  const attachSource = (target: IncrementSources, path: string, fileName: string) => {
    const sourceMatch = SOURCE_FILE.exec(fileName)
    if (!sourceMatch) {
      return
    }
    const kind = sourceMatch[1] as SourceKind
    const data = parseYaml(tree, path, findings)
    if (data === undefined) {
      return
    }
    if (target[kind]) {
      findings.push({
        rule: 'source-duplicate',
        claims: ['d-34t7y2iq'],
        path,
        message: `both .yaml and .yml exist for ${kind}`,
      })
      return
    }
    target[kind] = { path, data: data as never }
  }

  /** The increments directories carrying sources with no product root above them. */
  const undeclared = new Map<string, string>()

  for (const path of tree.paths()) {
    const incrementMatch = INCREMENT_SOURCE.exec(path)
    if (incrementMatch) {
      const [, prefix, dirName, fileName] = incrementMatch as unknown as [string, string, string, string]
      const rootDir = `products/${prefix}`
      const dir = `${rootDir}/increments/${dirName}`
      if (!roots.has(rootDir)) {
        // material inside a product's own tree is not an increment; anything else lacks a declaration
        if (![...roots.keys()].some((root) => rootDir.startsWith(`${root}/`)) && SOURCE_FILE.test(fileName)) {
          undeclared.set(rootDir, path)
        }
        continue
      }
      const entry = roots.get(rootDir)
      if (entry === undefined) {
        continue // the root lost its id to a duplicate; already reported
      }
      const wipMatch = WIP_DIR.exec(dirName)
      if (wipMatch) {
        let draft = entry.drafts.find((candidate) => candidate.name === dirName)
        if (!draft) {
          draft = { ordinal: Number(wipMatch[1]), name: dirName, dir }
          entry.drafts.push(draft)
        }
        attachSource(draft, path, fileName)
        continue
      }
      if (!INCREMENT_DIR.test(dirName)) {
        findings.push({
          rule: 'increment-dir-name',
          claims: dirName.startsWith('wip-') ? ['d-x0q4xgd8', 'd-34t7y2iq'] : ['d-34t7y2iq'],
          path,
          message:
            dirName.startsWith('wip-') ?
              `draft increment directory ${JSON.stringify(dirName)} is not wip-<NNN>-<slug>`
            : `increment directory ${JSON.stringify(dirName)} is not a zero-padded number`,
        })
        continue
      }
      const number = Number(dirName)
      let increment = entry.increments.find((candidate) => candidate.number === number)
      if (!increment) {
        increment = { number, dir }
        entry.increments.push(increment)
      }
      attachSource(increment, path, fileName)
      continue
    }

    const recordMatch = /^implementations\/([^/]+)\/([^/]+\.ya?ml)$/.exec(path)
    if (recordMatch) {
      const [, id, fileName] = recordMatch as unknown as [string, string, string]
      const data = parseYaml(tree, path, findings)
      if (data === undefined) {
        continue
      }
      const nameMatch = RECORD_FILE.exec(fileName)
      product(id).records.push({
        path,
        fileTarget: nameMatch ? Number(nameMatch[1]) : undefined,
        fileOrdinal: nameMatch ? Number(nameMatch[2]) : undefined,
        data: data as ImplementationRecord,
      })
    }
  }

  for (const entry of products.values()) {
    entry.increments.sort((a, b) => a.number - b.number)
    entry.drafts.sort((a, b) => a.ordinal - b.ordinal || a.name.localeCompare(b.name))
    entry.records.sort(
      (a, b) => (a.fileTarget ?? 0) - (b.fileTarget ?? 0) || (a.fileOrdinal ?? 0) - (b.fileOrdinal ?? 0),
    )
  }

  for (const [dir, path] of undeclared) {
    findings.push({
      rule: 'product-declaration',
      claims: ['d-34t7y2iq'],
      path,
      message: `increments exist but ${dir}/product.yaml does not`,
    })
  }

  return { products, findings }
}
