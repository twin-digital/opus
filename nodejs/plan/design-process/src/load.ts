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

/** Load `products/**` and `implementations/**` into per-product structures. */
export const loadProducts = (tree: FileTree): ProductsTree => {
  const findings: Finding[] = []
  const products = new Map<string, Product>()

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
        claims: ['d-kn05wb30'],
        path,
        message: `both .yaml and .yml exist for ${kind}`,
      })
      return
    }
    target[kind] = { path, data: data as never }
  }

  for (const path of tree.paths()) {
    const productMatch = /^products\/([^/]+)\/(.+)$/.exec(path)
    if (productMatch) {
      const [, id, rest] = productMatch as unknown as [string, string, string]
      if (/^product\.ya?ml$/.test(rest)) {
        const data = parseYaml(tree, path, findings)
        if (data !== undefined) {
          product(id).declaration = { path, data: data as ProductDeclaration }
        }
        continue
      }
      const incrementMatch = /^increments\/([^/]+)\/([^/]+)$/.exec(rest)
      if (incrementMatch) {
        const [, dirName, fileName] = incrementMatch as unknown as [string, string, string]
        const dir = `products/${id}/increments/${dirName}`
        const wipMatch = WIP_DIR.exec(dirName)
        if (wipMatch) {
          const entry = product(id)
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
            claims: dirName.startsWith('wip-') ? ['d-x0q4xgd8', 'd-kn05wb30'] : ['d-kn05wb30'],
            path,
            message:
              dirName.startsWith('wip-') ?
                `draft increment directory ${JSON.stringify(dirName)} is not wip-<NNN>-<slug>`
              : `increment directory ${JSON.stringify(dirName)} is not a zero-padded number`,
          })
          continue
        }
        const number = Number(dirName)
        const entry = product(id)
        let increment = entry.increments.find((candidate) => candidate.number === number)
        if (!increment) {
          increment = { number, dir }
          entry.increments.push(increment)
        }
        attachSource(increment, path, fileName)
        continue
      }
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
    if (!entry.declaration && entry.increments.length + entry.drafts.length > 0) {
      findings.push({
        rule: 'product-declaration',
        claims: ['d-kn05wb30'],
        path: entry.dir,
        message: 'increments exist but products/<id>/product.yaml does not',
      })
    }
  }

  return { products, findings }
}
