import { Ajv2020 } from 'ajv/dist/2020.js'

import { checkEvidenceBar } from './evidence-bar.js'
import { coverableClaimIds, foldProduct } from './fold.js'
import { loadProducts } from './load.js'
import { loadFacts, loadSchemaPool, loadSurfacePool } from './pools.js'
import { closureRequirementIds, resolvePresetClosure } from './presets.js'

import type { ErrorObject, ValidateFunction } from 'ajv'
import type { Fold } from './fold.js'
import type { IncrementSources, Product, ProductsTree } from './load.js'
import type { FactsPool, SchemaPool } from './pools.js'
import type { PresetClosure } from './presets.js'
import type { FileTree } from './tree.js'
import type { Finding, QuestionEntry } from './types.js'

const CLAIM_ID = /^[rd]-[0-9a-z]{8}$/
const QUESTION_ID = /^q-[0-9a-z]{8}$/

/**
 * Every increment directory a rule reads: the published ones, and the draft increments in flight
 * that the gate checks as they are worked (d-1qn5jzgd).
 */
const allIncrements = (product: Product): IncrementSources[] => [...product.increments, ...product.drafts]

export interface ValidateOptions {
  /** Base tree (ordinarily main) enabling the change rules; omitted, only tree-state rules run. */
  base?: FileTree
}

/** Apply every rule in force to the head tree; any finding blocks the merge. */
export const validateTree = (head: FileTree, options: ValidateOptions = {}): Finding[] => {
  const findings: Finding[] = []

  const schemaPool = loadSchemaPool(head)
  findings.push(...schemaPool.findings)
  const surfacePool = loadSurfacePool(head)
  findings.push(...surfacePool.findings)
  const facts = loadFacts(head)

  findings.push(...checkSchemaRefsResolve(schemaPool))

  const ajv = buildAjv(schemaPool, findings)

  findings.push(...checkEvidenceBar(head, schemaPool, ajv))

  const productsTree = loadProducts(head)
  findings.push(...productsTree.findings)

  for (const product of productsTree.products.values()) {
    findings.push(...checkStructuredFiles(product, schemaPool, ajv))
    findings.push(...checkIncrementNumbering(product))
    findings.push(...checkIds(product))
    findings.push(...checkDecisionRules(product))
    findings.push(...checkQuestionRules(product))
    findings.push(...checkCitations(product, facts, productsTree))
    findings.push(...checkModel(product, schemaPool.entries, surfacePool.entries))
    findings.push(...checkPresets(product, productsTree))
    findings.push(...checkRecords(product, productsTree))
  }

  if (options.base) {
    findings.push(...checkChanges(head, options.base))
  }

  return findings
}

const buildAjv = (schemaPool: SchemaPool, findings: Finding[]): Ajv2020 => {
  const ajv = new Ajv2020({ strict: false, allErrors: true, allowUnionTypes: true })
  for (const entry of schemaPool.entries.values()) {
    try {
      ajv.addSchema(entry.schema, entry.id)
    } catch (error) {
      findings.push({
        rule: 'schema-pool-parse',
        claims: ['r-2fytqadu'],
        path: entry.path,
        message: `not a usable JSON Schema: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }
  return ajv
}

const checkSchemaRefsResolve = (schemaPool: SchemaPool): Finding[] => {
  const findings: Finding[] = []
  for (const entry of schemaPool.entries.values()) {
    for (const ref of collectPoolRefs(entry.schema)) {
      if (!schemaPool.entries.has(ref)) {
        findings.push({
          rule: 'schema-ref-resolves',
          claims: ['r-2fytqadu'],
          path: entry.path,
          message: `$ref ${ref} resolves to no pool schema`,
        })
      }
    }
  }
  return findings
}

/** Pool identities referenced by `$ref` anywhere in a schema document. */
const collectPoolRefs = (node: unknown, refs: Set<string> = new Set()): Set<string> => {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectPoolRefs(item, refs)
    }
  } else if (typeof node === 'object' && node !== null) {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string' && value.startsWith('/')) {
        const identity = value.split('#')[0] ?? ''
        if (identity.length > 0) {
          refs.add(identity)
        }
      } else {
        collectPoolRefs(value, refs)
      }
    }
  }
  return refs
}

interface StructuredFile {
  path: string
  entity: string
  data: unknown
}

const structuredFiles = (product: Product): StructuredFile[] => {
  const files: StructuredFile[] = []
  if (product.declaration) {
    files.push({ path: product.declaration.path, entity: 'product', data: product.declaration.data })
  }
  for (const increment of allIncrements(product)) {
    for (const kind of ['requirements', 'decisions', 'questions'] as const) {
      const source = increment[kind]
      if (source) {
        files.push({ path: source.path, entity: kind, data: source.data })
      }
    }
  }
  for (const record of product.records) {
    files.push({ path: record.path, entity: 'implementation', data: record.data })
  }
  return files
}

const checkStructuredFiles = (product: Product, schemaPool: SchemaPool, ajv: Ajv2020): Finding[] => {
  const findings: Finding[] = []
  for (const file of structuredFiles(product)) {
    const version =
      typeof file.data === 'object' && file.data !== null && !Array.isArray(file.data) ?
        (file.data as Record<string, unknown>).version
      : undefined
    if (typeof version !== 'string' && typeof version !== 'number') {
      findings.push({
        rule: 'version-names-schema',
        claims: ['d-i47qv6oa'],
        path: file.path,
        message: "missing version: the pool version of the file's own schema",
      })
      continue
    }
    const schemaId = `/design-process/${file.entity}@${version}`
    if (!schemaPool.entries.has(schemaId)) {
      findings.push({
        rule: 'version-resolves',
        claims: ['r-bua9wl1s', 'd-i47qv6oa'],
        path: file.path,
        message: `version resolves to no pool schema: ${schemaId}`,
      })
      continue
    }
    let validate: ValidateFunction | undefined
    try {
      validate = ajv.getSchema(schemaId) as ValidateFunction | undefined
    } catch (error) {
      findings.push({
        rule: 'schema-ref-resolves',
        claims: ['r-2fytqadu'],
        path: file.path,
        message: `schema ${schemaId} is not compilable: ${error instanceof Error ? error.message : String(error)}`,
      })
      continue
    }
    if (!validate) {
      continue
    }
    if (!validate(file.data)) {
      for (const error of validate.errors ?? []) {
        findings.push({
          rule: 'source-validates',
          claims: ['r-gq90gngs', 'd-i47qv6oa'],
          path: file.path,
          message: formatAjvError(error),
        })
      }
    }
  }
  return findings
}

const formatAjvError = (error: ErrorObject): string =>
  `${error.instancePath === '' ? '(root)' : error.instancePath} ${error.message ?? 'is invalid'}`

const checkIncrementNumbering = (product: Product): Finding[] => {
  const findings: Finding[] = []
  for (const increment of product.increments) {
    const canonical = String(increment.number).padStart(3, '0')
    if (!increment.dir.endsWith(`/${canonical}`)) {
      findings.push({
        rule: 'increment-dir-name',
        claims: ['d-kn05wb30'],
        path: increment.dir,
        message: `directory name is not the zero-padded increment number ${canonical}`,
      })
    }
  }
  const byOrdinal = new Map<number, string[]>()
  for (const draft of product.drafts) {
    findings.push({
      rule: 'increment-dir-name',
      claims: ['d-x0q4xgd8', 'd-1qn5jzgd'],
      path: draft.dir,
      message: 'draft increment in flight; the landing rename claims its number before the merge',
    })
    byOrdinal.set(draft.ordinal, [...(byOrdinal.get(draft.ordinal) ?? []), draft.name])
  }
  for (const [ordinal, names] of byOrdinal) {
    if (names.length > 1) {
      findings.push({
        rule: 'draft-ordinal-unique',
        claims: ['d-x0q4xgd8'],
        path: `${product.dir}/increments`,
        message: `${names.join(' and ')} share the ordinal ${String(ordinal).padStart(3, '0')}, so they carry no relative order`,
      })
    }
  }

  // the density gate reads published numbers only: a wip ordinal is not one (d-1qn5jzgd)
  const numbers = new Set(product.increments.map((increment) => increment.number))
  const max = Math.max(0, ...numbers)
  const missing = Array.from({ length: max }, (_, index) => index + 1).filter((n) => !numbers.has(n))
  if (missing.length > 0) {
    findings.push({
      rule: 'increment-sequence-dense',
      claims: ['d-6x6l6ws7', 'd-d6hwdg9d'],
      path: product.dir,
      message: `increment numbers are not dense: missing ${missing.join(', ')}`,
    })
  }
  return findings
}

interface OwnedEntry {
  id: string
  path: string
}

const productEntries = (product: Product): { requirements: OwnedEntry[]; decisions: OwnedEntry[] } => {
  const requirements: OwnedEntry[] = []
  const decisions: OwnedEntry[] = []
  for (const increment of allIncrements(product)) {
    const requirementsSource = increment.requirements
    for (const entry of requirementsSource?.data.requirements ?? []) {
      requirements.push({ id: entry.id, path: requirementsSource?.path ?? increment.dir })
    }
    const decisionsSource = increment.decisions
    for (const entry of decisionsSource?.data.decisions ?? []) {
      decisions.push({ id: entry.id, path: decisionsSource?.path ?? increment.dir })
    }
  }
  return { requirements, decisions }
}

const checkIds = (product: Product): Finding[] => {
  const findings: Finding[] = []
  const { requirements, decisions } = productEntries(product)
  const seen = new Map<string, string>()
  for (const { id, path } of [...requirements, ...decisions]) {
    if (!CLAIM_ID.test(id)) {
      findings.push({
        rule: 'id-format',
        claims: ['d-e5ted839'],
        path,
        message: `${JSON.stringify(id)} is not {r|d}- followed by 8 lowercase base36 characters`,
      })
      continue
    }
    const existing = seen.get(id)
    if (existing !== undefined) {
      findings.push({
        rule: 'id-unique',
        claims: ['d-e5ted839'],
        path,
        message: `${id} is already declared in ${existing}`,
      })
    } else {
      seen.set(id, path)
    }
  }
  for (const increment of allIncrements(product)) {
    const source = increment.questions
    if (!source) {
      continue
    }
    const questionIds = new Map<string, QuestionEntry>()
    for (const entry of source.data.questions ?? []) {
      if (!QUESTION_ID.test(entry.id)) {
        findings.push({
          rule: 'id-format',
          claims: ['d-vx26i23m'],
          path: source.path,
          message: `${JSON.stringify(entry.id)} is not q- followed by 8 lowercase base36 characters`,
        })
      } else if (questionIds.has(entry.id)) {
        findings.push({
          rule: 'id-unique',
          claims: ['d-vx26i23m'],
          path: source.path,
          message: `${entry.id} is declared twice in this increment`,
        })
      } else {
        questionIds.set(entry.id, entry)
      }
    }
  }
  return findings
}

const checkDecisionRules = (product: Product): Finding[] => {
  const findings: Finding[] = []
  for (const increment of allIncrements(product)) {
    const source = increment.decisions
    for (const entry of source?.data.decisions ?? []) {
      if (entry.status === 'proposed') {
        findings.push({
          rule: 'no-proposed-decision',
          claims: ['r-0axqvtcc'],
          path: source?.path ?? increment.dir,
          message: `${entry.id} is still proposed`,
        })
      }
    }
  }
  return findings
}

const checkQuestionRules = (product: Product): Finding[] => {
  const findings: Finding[] = []
  for (const increment of allIncrements(product)) {
    const source = increment.questions
    const questions = source?.data.questions ?? []
    if (source && questions.length > 0) {
      findings.push({
        rule: 'no-open-questions',
        claims: ['r-ygg7q7rh', 'd-uzygmhfc'],
        path: source.path,
        message: `${questions.length} open question(s) still carried: ${questions.map((question) => question.id).join(', ')}`,
      })
    }
  }
  return findings
}

const checkCitations = (product: Product, facts: FactsPool, productsTree: ProductsTree): Finding[] => {
  const findings: Finding[] = []
  const { requirements, decisions } = productEntries(product)
  const requirementIds = new Set(requirements.map((entry) => entry.id))
  const decisionIds = new Set(decisions.map((entry) => entry.id))
  const fold = foldProduct(product, undefined, true)
  // a requirement in force through an adopted preset is folded, projected, and covered, so it is
  // citable: citations resolve against the folded requirement set, adopted ones included
  const adopted = closureRequirementIds(resolvePresetClosure(product, productsTree, fold))
  const known = new Set([...requirementIds, ...decisionIds, ...adopted])
  const inForce = coverableClaimIds(fold)
  for (const id of adopted) {
    inForce.add(id)
  }
  for (const [id, { entry }] of fold.decisions) {
    if (entry.status === 'rejected' || entry.status === 'deferred') {
      inForce.add(id) // in force for citations though not coverable: rejected awaits replacement, deferred its answer
    }
  }

  const checkCitation = (citation: string, path: string, context: string, entryInForce: boolean) => {
    if (QUESTION_ID.test(citation)) {
      findings.push({
        rule: 'citation-not-question',
        claims: ['r-m36ie8ee'],
        path,
        message: `${context} cites open question ${citation}; nothing rests on an open question`,
      })
    } else if (CLAIM_ID.test(citation)) {
      if (!known.has(citation)) {
        findings.push({
          rule: 'citation-resolves',
          claims: ['d-eaw3u72o'],
          path,
          message: `${context} cites ${citation}, which no increment of this product declares`,
        })
      }
    } else if (citation.startsWith('f:')) {
      if (!facts.ids.has(citation.slice(2))) {
        findings.push({
          rule: 'citation-resolves',
          claims: ['d-eaw3u72o'],
          path,
          message: `${context} cites ${citation}, which the facts pool does not declare`,
        })
      } else if (entryInForce && facts.retired.has(citation.slice(2))) {
        findings.push({
          rule: 'citation-fact-retired',
          claims: ['d-eaw3u72o', 'd-o99k4ld8'],
          path,
          message: `${context} is in force and cites retired fact ${citation}; move the citation to its replacement, or take the entry out of force before the fact retires`,
        })
      }
    } else {
      findings.push({
        rule: 'citation-form',
        claims: ['d-eaw3u72o'],
        path,
        message: `${context} cites ${JSON.stringify(citation)}, which is not a requirement, decision, or f:<fact> citation`,
      })
    }
  }

  for (const increment of allIncrements(product)) {
    const decisionsSource = increment.decisions
    if (decisionsSource) {
      for (const entry of decisionsSource.data.decisions ?? []) {
        for (const citation of entry.because ?? []) {
          checkCitation(citation, decisionsSource.path, entry.id, inForce.has(entry.id))
        }
        if (entry.supersedes !== undefined && !decisionIds.has(entry.supersedes)) {
          findings.push({
            rule: 'citation-resolves',
            claims: ['d-eaw3u72o'],
            path: decisionsSource.path,
            message: `${entry.id} supersedes ${entry.supersedes}, which no increment of this product declares`,
          })
        }
      }
      for (const retirement of decisionsSource.data.retires ?? []) {
        if (!decisionIds.has(retirement.id)) {
          findings.push({
            rule: 'citation-resolves',
            claims: ['d-eaw3u72o'],
            path: decisionsSource.path,
            message: `retires ${retirement.id}, which no increment of this product declares`,
          })
        }
      }
    }
    const requirementsSource = increment.requirements
    if (requirementsSource) {
      for (const entry of requirementsSource.data.requirements ?? []) {
        for (const citation of entry.informed_by ?? []) {
          if (QUESTION_ID.test(citation) || CLAIM_ID.test(citation) || citation.startsWith('f:')) {
            checkCitation(citation, requirementsSource.path, entry.id, inForce.has(entry.id))
          }
        }
        if (entry.amends !== undefined && !requirementIds.has(entry.amends)) {
          findings.push({
            rule: 'citation-resolves',
            claims: ['d-eaw3u72o'],
            path: requirementsSource.path,
            message: `${entry.id} amends ${entry.amends}, which no increment of this product declares`,
          })
        }
      }
      for (const retirement of requirementsSource.data.retires ?? []) {
        if (!requirementIds.has(retirement.id)) {
          findings.push({
            rule: 'citation-resolves',
            claims: ['d-eaw3u72o'],
            path: requirementsSource.path,
            message: `retires ${retirement.id}, which no increment of this product declares`,
          })
        }
      }
    }
  }
  return findings
}

const checkModel = (product: Product, schemas: Map<string, unknown>, surfaces: Map<string, unknown>): Finding[] => {
  const findings: Finding[] = []
  for (const increment of allIncrements(product)) {
    const source = increment.requirements
    if (!source) {
      continue
    }
    const names = new Set<string>()
    for (const entry of source.data.model ?? []) {
      if (names.has(entry.name)) {
        findings.push({
          rule: 'model-name-unique',
          claims: ['r-bua9wl1s'],
          path: source.path,
          message: `model declares entity ${JSON.stringify(entry.name)} twice`,
        })
      }
      names.add(entry.name)
      if (entry.schema !== undefined && !schemas.has(entry.schema)) {
        findings.push({
          rule: 'model-ref-resolves',
          claims: ['r-bua9wl1s'],
          path: source.path,
          message: `entity ${entry.name} binds ${entry.schema}, which the schema pool does not hold`,
        })
      }
      // `requirements@1` spells the key `api:`; `@2` spells it `surface:` (d-pe4j25wq)
      const surface = entry.surface ?? entry.api
      if (surface !== undefined && !surfaces.has(surface)) {
        findings.push({
          rule: 'model-ref-resolves',
          claims: ['r-j232vwp4', 'r-bua9wl1s'],
          path: source.path,
          message: `entity ${entry.name} binds ${surface}, which the surface pool does not hold`,
        })
      }
    }
  }
  return findings
}

const checkPresets = (product: Product, productsTree: ProductsTree): Finding[] => {
  const findings: Finding[] = []
  for (const increment of allIncrements(product)) {
    const presets = increment.requirements?.data.presets ?? []
    const path = increment.requirements?.path
    const byName = new Map<string, Set<string>>()
    for (const entry of presets) {
      const statuses = byName.get(entry.name) ?? new Set()
      statuses.add(entry.status ?? 'adopted')
      byName.set(entry.name, statuses)
    }
    for (const [name, statuses] of byName) {
      if (statuses.size > 1) {
        findings.push({
          rule: 'preset-adopt-and-drop',
          claims: ['d-a8hiceqo'],
          path,
          message: `${name} is both adopted and dropped in one increment`,
        })
      }
    }
    for (const entry of presets) {
      if ((entry.status ?? 'adopted') !== 'adopted') {
        continue
      }
      const preset = productsTree.products.get(entry.name)
      if (!preset) {
        findings.push({
          rule: 'preset-resolves',
          claims: ['r-bwtud1e5'],
          path,
          message: `adopts ${entry.name}, which is not a declared product`,
        })
        continue
      }
      if (preset.declaration?.data.kind !== 'requirement-preset') {
        findings.push({
          rule: 'preset-kind',
          claims: ['d-wis1whfn'],
          path,
          message: `adopts ${entry.name}, whose kind is ${JSON.stringify(preset.declaration?.data.kind)} rather than requirement-preset`,
        })
        continue
      }
      const maxIncrement = preset.increments.at(-1)?.number ?? 0
      if (entry.version === undefined || entry.version > maxIncrement) {
        findings.push({
          rule: 'preset-version-published',
          claims: ['r-bwtud1e5'],
          path,
          message: `adopts ${entry.name}@${entry.version}, but its newest published increment is ${maxIncrement}`,
        })
      }
    }
  }

  const fold = foldProduct(product, undefined, true)
  const closure = resolvePresetClosure(product, productsTree, fold)
  findings.push(...closure.findings)
  findings.push(...checkPresetConflicts(product, fold, closure))
  return findings
}

/**
 * The collision the gate blocks on: two declarations in force of one requirement id, by the product
 * and a preset in its closure or by two of those presets (d-wlkql151). A retired declaration is
 * absent from its fold, so it collides with nothing; an id reached twice is one declaration.
 */
const checkPresetConflicts = (product: Product, fold: Fold, closure: PresetClosure): Finding[] => {
  const findings: Finding[] = []
  const declaredBy = new Map<string, string>()
  for (const id of fold.requirements.keys()) {
    declaredBy.set(id, product.id)
  }
  for (const preset of closure.presets) {
    const source = `${preset.name}@${preset.version}`
    for (const id of preset.requirements.keys()) {
      const other = declaredBy.get(id)
      if (other === undefined) {
        declaredBy.set(id, source)
        continue
      }
      findings.push({
        rule: 'preset-conflict',
        claims: ['r-bwtud1e5', 'd-wlkql151'],
        path: product.dir,
        message: `${other} and adopted ${source} both declare ${id}`,
      })
    }
  }
  return findings
}

const checkRecords = (product: Product, productsTree: ProductsTree): Finding[] => {
  const findings: Finding[] = []
  const byTarget = new Map<number, number[]>()
  for (const record of product.records) {
    if (record.fileTarget === undefined || record.fileOrdinal === undefined) {
      findings.push({
        rule: 'record-name',
        claims: ['d-vsrxwv8u'],
        path: record.path,
        message: 'record file name is not <NNN>-<k>.yaml',
      })
      continue
    }
    if (typeof record.data.target !== 'number') {
      continue // schema validation reports the missing field
    }
    if (record.data.product !== product.id) {
      findings.push({
        rule: 'record-product',
        claims: ['d-vsrxwv8u'],
        path: record.path,
        message: `record declares product ${JSON.stringify(record.data.product)} but is filed under ${product.id}`,
      })
    }
    if (record.fileTarget !== record.data.target) {
      findings.push({
        rule: 'record-name',
        claims: ['d-vsrxwv8u'],
        path: record.path,
        message: `file name targets ${record.fileTarget} but the record targets ${record.data.target}`,
      })
    }
    if (!product.increments.some((increment) => increment.number === record.data.target)) {
      findings.push({
        rule: 'record-target-published',
        claims: ['d-0nl6sd96'],
        path: record.path,
        message: `target ${record.data.target} is not a published increment of ${product.id}`,
      })
      continue
    }
    const ordinals = byTarget.get(record.data.target) ?? []
    ordinals.push(record.fileOrdinal)
    byTarget.set(record.data.target, ordinals)

    const fold = foldProduct(product, record.data.target)
    const coverable = coverableClaimIds(fold)
    const deferred = new Set(
      [...fold.decisions.values()].filter(({ entry }) => entry.status === 'deferred').map(({ entry }) => entry.id),
    )
    for (const id of closureRequirementIds(resolvePresetClosure(product, productsTree, fold))) {
      coverable.add(id)
    }
    const covered = new Set<string>()
    for (const coverage of record.data.coverage ?? []) {
      covered.add(coverage.claim)
      if (deferred.has(coverage.claim)) {
        findings.push({
          rule: 'record-covers-deferred',
          claims: ['d-3orwwaze'],
          path: record.path,
          message: `coverage names ${coverage.claim}, a deferred decision; nothing covers a deferral until its answer lands`,
        })
      } else if (!coverable.has(coverage.claim)) {
        findings.push({
          rule: 'record-claim-in-force',
          claims: ['d-0nl6sd96'],
          path: record.path,
          message: `coverage names ${coverage.claim}, which is not a claim in force at increment ${record.data.target}`,
        })
      }
    }
    const missing = [...coverable].filter((id) => !covered.has(id)).sort()
    if (missing.length > 0) {
      findings.push({
        rule: 'record-coverage-complete',
        claims: ['r-tue7kfgt', 'd-3orwwaze'],
        path: record.path,
        message: `coverage misses ${missing.length} claim(s) in force at increment ${record.data.target}: ${missing.join(', ')}`,
      })
    }
  }
  for (const [target, ordinals] of byTarget) {
    const sorted = [...ordinals].sort((a, b) => a - b)
    sorted.forEach((ordinal, index) => {
      if (ordinal !== index + 1) {
        findings.push({
          rule: 'record-ordinal-dense',
          claims: ['d-vsrxwv8u'],
          path: `implementations/${product.id}`,
          message: `records targeting ${target} have ordinals ${sorted.join(', ')}; expected a dense sequence from 1`,
        })
      }
    })
  }
  return findings
}

// --- change rules -------------------------------------------------------------------------------

const checkChanges = (head: FileTree, base: FileTree): Finding[] => {
  const findings: Finding[] = []
  const baseProducts = loadProducts(base)
  const basePaths = new Set(base.paths())
  const headPaths = new Set(head.paths())

  // published increments are immutable (r-caao9k3z)
  for (const product of baseProducts.products.values()) {
    for (const increment of product.increments) {
      const prefix = `${increment.dir}/`
      const involved = new Set([
        ...base.paths().filter((path) => path.startsWith(prefix)),
        ...head.paths().filter((path) => path.startsWith(prefix)),
      ])
      for (const path of involved) {
        if (!headPaths.has(path)) {
          findings.push({
            rule: 'published-immutable',
            claims: ['r-caao9k3z'],
            path,
            message: 'deleted from a published increment',
          })
        } else if (!basePaths.has(path)) {
          findings.push({
            rule: 'published-immutable',
            claims: ['r-caao9k3z'],
            path,
            message: 'added to a published increment',
          })
        } else if (base.read(path) !== head.read(path)) {
          findings.push({
            rule: 'published-immutable',
            claims: ['r-caao9k3z'],
            path,
            message: 'edited in a published increment',
          })
        }
      }
    }
  }

  // shipped implementation records are immutable (d-0hedq82d)
  for (const path of base.paths().filter((candidate) => candidate.startsWith('implementations/'))) {
    if (!headPaths.has(path)) {
      findings.push({
        rule: 'record-immutable',
        claims: ['d-0hedq82d'],
        path,
        message: 'implementation record deleted',
      })
    } else if (base.read(path) !== head.read(path)) {
      findings.push({ rule: 'record-immutable', claims: ['d-0hedq82d'], path, message: 'implementation record edited' })
    }
  }

  // pool versions bound by published increments are immutable (r-2fytqadu, r-j232vwp4)
  const baseSchemas = loadSchemaPool(base)
  const headSchemas = loadSchemaPool(head)
  const boundSchemas = boundSchemaIdentities(baseProducts, baseSchemas)
  for (const identity of boundSchemas) {
    const baseEntry = baseSchemas.entries.get(identity)
    if (!baseEntry) {
      continue
    }
    const headEntry = headSchemas.entries.get(identity)
    if (!headEntry) {
      findings.push({
        rule: 'pool-version-immutable',
        claims: ['r-2fytqadu'],
        path: baseEntry.path,
        message: `${identity} is bound by a published increment and may not be removed`,
      })
    } else if (canonicalize(baseEntry.schema) !== canonicalize(headEntry.schema)) {
      findings.push({
        rule: 'pool-version-immutable',
        claims: ['r-2fytqadu'],
        path: headEntry.path,
        message: `${identity} is bound by a published increment and may not be edited`,
      })
    }
  }

  const baseSurfaces = loadSurfacePool(base)
  const headSurfaces = loadSurfacePool(head)
  for (const identity of boundSurfaceIdentities(baseProducts)) {
    const baseEntry = baseSurfaces.entries.get(identity)
    if (!baseEntry) {
      continue
    }
    const headEntry = headSurfaces.entries.get(identity)
    if (!headEntry) {
      findings.push({
        rule: 'pool-version-immutable',
        claims: ['r-j232vwp4'],
        path: baseEntry.path,
        message: `${identity} is bound by a published increment and may not be removed`,
      })
    } else if (baseEntry.content !== headEntry.content) {
      findings.push({
        rule: 'pool-version-immutable',
        claims: ['r-j232vwp4'],
        path: headEntry.path,
        message: `${identity} is bound by a published increment and may not be edited`,
      })
    }
  }

  // a new record lands only at head (d-ki941p9b)
  const headProducts = loadProducts(head)
  for (const product of headProducts.products.values()) {
    const newest = product.increments.at(-1)?.number
    for (const record of product.records) {
      if (basePaths.has(record.path) || typeof record.data.target !== 'number') {
        continue
      }
      if (newest !== undefined && record.data.target !== newest) {
        findings.push({
          rule: 'record-target-newest',
          claims: ['d-ki941p9b'],
          path: record.path,
          message: `record targets ${record.data.target}, but the newest published increment is ${newest}; retarget before landing`,
        })
      }
    }
  }

  return findings
}

/** Schema identities bound by any published increment: source `version` fields, model bindings, and their `$ref` closure. */
const boundSchemaIdentities = (products: ProductsTree, schemas: SchemaPool): Set<string> => {
  const bound = new Set<string>()
  for (const product of products.products.values()) {
    if (product.declaration) {
      bound.add(`/design-process/product@${product.declaration.data.version}`)
    }
    for (const record of product.records) {
      bound.add(`/design-process/implementation@${record.data.version}`)
    }
    for (const increment of product.increments) {
      for (const kind of ['requirements', 'decisions', 'questions'] as const) {
        const source = increment[kind]
        if (source) {
          bound.add(`/design-process/${kind}@${source.data.version}`)
        }
      }
      for (const entry of increment.requirements?.data.model ?? []) {
        if (entry.schema !== undefined) {
          bound.add(entry.schema)
        }
      }
    }
  }
  const queue = [...bound]
  for (let identity = queue.pop(); identity !== undefined; identity = queue.pop()) {
    const entry = schemas.entries.get(identity)
    if (!entry) {
      continue
    }
    for (const ref of collectPoolRefs(entry.schema)) {
      if (!bound.has(ref)) {
        bound.add(ref)
        queue.push(ref)
      }
    }
  }
  return bound
}

const boundSurfaceIdentities = (products: ProductsTree): Set<string> => {
  const bound = new Set<string>()
  for (const product of products.products.values()) {
    for (const increment of product.increments) {
      for (const entry of increment.requirements?.data.model ?? []) {
        const surface = entry.surface ?? entry.api
        if (surface !== undefined) {
          bound.add(surface)
        }
      }
    }
  }
  return bound
}

const canonicalize = (value: unknown): string =>
  JSON.stringify(value, function replacer(this: unknown, _key: string, val: unknown) {
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      return Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
    }
    return val
  })
