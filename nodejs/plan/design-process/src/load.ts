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

export interface Increment {
  number: number
  dir: string
  requirements?: SourceFile<RequirementsSource>
  decisions?: SourceFile<DecisionsSource>
  questions?: SourceFile<QuestionsSource>
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
  increments: Increment[]
  records: RecordFile[]
}

export interface ProductsTree {
  products: Map<string, Product>
  findings: Finding[]
}

const SOURCE_FILE = /^(requirements|decisions|questions)\.ya?ml$/
const INCREMENT_DIR = /^\d{3,}$/
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
      entry = { id, dir: `products/${id}`, increments: [], records: [] }
      products.set(id, entry)
    }
    return entry
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
        if (!INCREMENT_DIR.test(dirName)) {
          findings.push({
            rule: 'increment-dir-name',
            claims: ['d-kn05wb30'],
            path,
            message: `increment directory ${JSON.stringify(dirName)} is not a zero-padded number`,
          })
          continue
        }
        const number = Number(dirName)
        const entry = product(id)
        let increment = entry.increments.find((candidate) => candidate.number === number)
        if (!increment) {
          increment = { number, dir: `products/${id}/increments/${dirName}` }
          entry.increments.push(increment)
        }
        const sourceMatch = SOURCE_FILE.exec(fileName)
        if (sourceMatch) {
          const kind = sourceMatch[1] as SourceKind
          const data = parseYaml(tree, path, findings)
          if (data !== undefined) {
            if (increment[kind]) {
              findings.push({
                rule: 'source-duplicate',
                claims: ['d-kn05wb30'],
                path,
                message: `both .yaml and .yml exist for ${kind}`,
              })
            } else {
              increment[kind] = { path, data: data as never }
            }
          }
        }
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
    entry.records.sort(
      (a, b) => (a.fileTarget ?? 0) - (b.fileTarget ?? 0) || (a.fileOrdinal ?? 0) - (b.fileOrdinal ?? 0),
    )
    if (!entry.declaration && entry.increments.length > 0) {
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
