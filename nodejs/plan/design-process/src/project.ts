import { coverableClaimIds, foldProduct } from './fold.js'
import { loadProducts } from './load.js'
import { resolvePresetClosure } from './presets.js'

import type { Fold, FoldedClaim, IncrementRef } from './fold.js'
import type { Product, ProductsTree } from './load.js'
import type { AdoptedPreset } from './presets.js'
import type { FileTree } from './tree.js'
import type { CoverageEntry, DecisionEntry, RequirementEntry } from './types.js'

export interface ProjectOptions {
  at?: number
  facet?: string
}

/** Render the projection of a product at an increment: the fold, joined and ordered for a reader. */
export const projectProduct = (tree: FileTree, productId: string, options: ProjectOptions = {}): string => {
  const productsTree: ProductsTree = loadProducts(tree)
  const product = productsTree.products.get(productId)
  if (!product) {
    throw new Error(
      `no product ${JSON.stringify(productId)}; declared products: ${[...productsTree.products.keys()].join(', ') || '(none)'}`,
    )
  }
  // an asked-for increment names published state; the default projection is the tree as it stands,
  // drafts included (d-x1mhu3a3)
  const fold = foldProduct(product, options.at, options.at === undefined)
  const lines: string[] = []
  const facetFilter = options.facet

  const hasFacet = (facets: string | string[] | undefined): boolean => {
    if (facetFilter === undefined) {
      return true
    }
    return facets !== undefined && (Array.isArray(facets) ? facets : [facets]).includes(facetFilter)
  }

  lines.push(`# ${product.id} @ ${fold.label}`, '')
  if (product.declaration?.data.kind !== undefined) {
    lines.push(`kind: ${product.declaration.data.kind}`, '')
  }

  // the preset closure the product's declarations reach, and the requirements it contributes
  const adopted = resolvePresetClosure(product, productsTree, fold).presets
  if (adopted.length > 0) {
    lines.push('## presets', '')
    for (const preset of adopted) {
      // a preset the product did not adopt directly names the presets it came through
      const via = preset.via.length > 2 ? `, via ${preset.via.slice(1, -1).join(' → ')}` : ''
      lines.push(`- ${preset.name}@${preset.version} (${preset.requirements.size} requirements${via})`)
    }
    lines.push('')
  }

  const requirements = [...fold.requirements.values()].filter(({ entry }) => hasFacet(entry.facets))
  lines.push(`## requirements (${requirements.length} in force${adopted.length > 0 ? ', plus adopted below' : ''})`, '')
  for (const { entry, increment } of requirements) {
    lines.push(...renderRequirement(entry, increment))
  }
  for (const preset of adopted) {
    for (const { entry, increment } of preset.requirements.values()) {
      if (hasFacet(entry.facets)) {
        lines.push(...renderRequirement(entry, increment, `${preset.name}@${preset.version}`))
      }
    }
  }

  const decisions = orderByBecause([...fold.decisions.values()]).filter(({ entry }) => hasFacet(entry.facets))
  const counts = { accepted: 0, tolerated: 0, delegated: 0, rejected: 0, proposed: 0, deferred: 0 }
  for (const { entry } of decisions) {
    counts[entry.status] += 1
  }
  lines.push(
    `## decisions (${decisions.length} in force: ${counts.accepted} accepted, ${counts.tolerated} tolerated, ${counts.rejected} rejected; ${counts.delegated} delegated — abstained, not reviewed; ${counts.deferred} deferred — awaiting their answers)`,
    '',
  )
  for (const { entry, increment } of decisions) {
    lines.push(...renderDecision(entry, increment))
  }

  if (fold.model.size > 0) {
    lines.push('## model', '')
    for (const { entry } of fold.model.values()) {
      lines.push(
        `- **${entry.name}** → ${entry.schema ?? entry.surface ?? entry.api}${entry.description !== undefined ? ` — ${entry.description.trim()}` : ''}`,
      )
    }
    lines.push('')
  }

  lines.push(...renderCoverage(product, fold, adopted))
  lines.push(...renderDelta(product, fold))
  lines.push(...renderQuestions(product, fold))

  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`
}

/**
 * The projection as data, for `--json`: the same fold the rendered projection reads (r-rn6wxdn4).
 * The serialised form is not a published shape and changes without notice — it is neither exported
 * from the package's entry point nor held to a contract in the pools.
 */
export interface ProjectionData {
  product: string
  at: IncrementRef
  presets: { name: string; version: number; via: string[]; requirements: string[] }[]
  requirements: (RequirementEntry & { increment: IncrementRef; adopted_from?: string })[]
  decisions: (DecisionEntry & { increment: IncrementRef })[]
  model: { name: string; schema?: string; surface?: string; description?: string }[]
  coverage: { claim: string; adopted_from?: string; covered_by: CoverageEntry['covered_by'] | null }[]
  open_questions: { id: string; answer: string; question: string }[]
}

/** The folded, effective state of a product at an increment, as data rather than as a page. */
export const projectProductData = (tree: FileTree, productId: string, options: ProjectOptions = {}): ProjectionData => {
  const productsTree: ProductsTree = loadProducts(tree)
  const product = productsTree.products.get(productId)
  if (!product) {
    throw new Error(`no product ${JSON.stringify(productId)}`)
  }
  const fold = foldProduct(product, options.at, options.at === undefined)
  const adopted = resolvePresetClosure(product, productsTree, fold).presets
  const coverageByClaim = new Map<string, CoverageEntry>()
  for (const record of product.records) {
    if (typeof record.data.target === 'number' && record.data.target <= fold.at) {
      for (const entry of record.data.coverage ?? []) {
        coverageByClaim.set(entry.claim, entry)
      }
    }
  }
  const coverable = coverableClaimIds(fold)
  const claims: { id: string; adopted_from?: string }[] = [
    ...[...fold.requirements.keys()].map((id) => ({ id })),
    ...adopted.flatMap((preset) =>
      [...preset.requirements.keys()].map((id) => ({ id, adopted_from: `${preset.name}@${preset.version}` })),
    ),
    ...[...fold.decisions.keys()].filter((id) => coverable.has(id)).map((id) => ({ id })),
  ].filter((claim, index, all) => all.findIndex((other) => other.id === claim.id) === index)

  return {
    product: product.id,
    at: fold.label,
    presets: adopted.map((preset) => ({
      name: preset.name,
      version: preset.version,
      via: preset.via,
      requirements: [...preset.requirements.keys()],
    })),
    requirements: [
      ...[...fold.requirements.values()].map(({ entry, increment }) => ({ ...entry, increment })),
      ...adopted.flatMap((preset) =>
        [...preset.requirements.values()].map(({ entry, increment }) => ({
          ...entry,
          increment,
          adopted_from: `${preset.name}@${preset.version}`,
        })),
      ),
    ],
    decisions: orderByBecause([...fold.decisions.values()]).map(({ entry, increment }) => ({ ...entry, increment })),
    model: [...fold.model.values()].map(({ entry }) => ({
      name: entry.name,
      schema: entry.schema,
      surface: entry.surface ?? entry.api,
      description: entry.description,
    })),
    coverage: claims.map((claim) => ({
      claim: claim.id,
      adopted_from: claim.adopted_from,
      covered_by: coverageByClaim.get(claim.id)?.covered_by ?? null,
    })),
    open_questions: [
      ...product.increments.filter((candidate) => candidate.number <= fold.at),
      ...product.drafts.filter((candidate) => fold.drafts.includes(candidate.name)),
    ].flatMap((increment) =>
      (increment.questions?.data.questions ?? []).map((question) => ({
        id: question.id,
        answer: question.answer,
        question: question.question.trim(),
      })),
    ),
  }
}

const formatFacets = (facets: string | string[] | undefined): string =>
  facets === undefined ? '' : ` [${(Array.isArray(facets) ? facets : [facets]).join(', ')}]`

const renderRequirement = (entry: RequirementEntry, increment: IncrementRef, adoptedFrom?: string): string[] => {
  const lines = [
    `### ${entry.id} — ${entry.title ?? '(untitled)'}${formatFacets(entry.facets)}`,
    '',
    `_declared by increment ${increment}${adoptedFrom !== undefined ? `, adopted from ${adoptedFrom}` : ''}_`,
    '',
    entry.statement.trim(),
    '',
  ]
  if (entry.verification) {
    lines.push('verification:', '')
    for (const step of entry.verification) {
      lines.push('do' in step ? `- do: ${step.do}` : `- verify: ${step.verify}`)
    }
    lines.push('')
  }
  return lines
}

const renderDecision = (entry: DecisionEntry, increment: IncrementRef): string[] => {
  const pinned =
    entry.pinned !== undefined && entry.pinned !== false ?
      `, pinned: ${entry.pinned.reason}${entry.pinned.notes !== undefined ? ` (${entry.pinned.notes})` : ''}`
    : ''
  const lines = [
    `### ${entry.id} — ${entry.title ?? '(untitled)'}${formatFacets(entry.facets)}`,
    '',
    `_${entry.status}${pinned}; declared by increment ${increment}_`,
    '',
    entry.statement.trim(),
    '',
  ]
  if (entry.status === 'rejected' && entry.rejection_reason !== undefined) {
    lines.push(`rejected because: ${entry.rejection_reason.trim()}`, '')
  }
  if (entry.because && entry.because.length > 0) {
    lines.push(`because: ${entry.because.join(', ')}`, '')
  }
  if (entry.revisit_when && entry.revisit_when.length > 0) {
    lines.push(`revisit when: ${entry.revisit_when.map((condition) => condition.trim()).join('; ')}`, '')
  }
  return lines
}

/** Order decisions so that cited decisions precede the decisions built on them; file order breaks ties. */
const orderByBecause = (decisions: FoldedClaim<DecisionEntry>[]): FoldedClaim<DecisionEntry>[] => {
  const byId = new Map(decisions.map((claim) => [claim.entry.id, claim]))
  const visited = new Set<string>()
  const ordered: FoldedClaim<DecisionEntry>[] = []
  const visit = (claim: FoldedClaim<DecisionEntry>, trail: Set<string>) => {
    if (visited.has(claim.entry.id) || trail.has(claim.entry.id)) {
      return
    }
    trail.add(claim.entry.id)
    for (const citation of claim.entry.because ?? []) {
      const cited = byId.get(citation)
      if (cited) {
        visit(cited, trail)
      }
    }
    trail.delete(claim.entry.id)
    visited.add(claim.entry.id)
    ordered.push(claim)
  }
  for (const claim of decisions) {
    visit(claim, new Set())
  }
  return ordered
}

const renderCoverage = (product: Product, fold: Fold, adopted: AdoptedPreset[]): string[] => {
  const coverageByClaim = new Map<string, CoverageEntry>()
  for (const record of product.records) {
    if (typeof record.data.target !== 'number' || record.data.target > fold.at) {
      continue
    }
    for (const entry of record.data.coverage ?? []) {
      coverageByClaim.set(entry.claim, entry)
    }
  }
  const deferred = [...fold.decisions.values()].filter(({ entry }) => entry.status === 'deferred').length
  // exactly what a record must cover, adopted preset requirements included (d-3orwwaze); the
  // validator reads the same set, so a reconciliation from here holds at the gate
  const coverable = coverableClaimIds(fold)
  const claims: { id: string; from?: string }[] = [
    ...[...fold.requirements.values()].map(({ entry }) => ({ id: entry.id })),
    ...adopted.flatMap((preset) =>
      [...preset.requirements.keys()].map((id) => ({ id, from: `${preset.name}@${preset.version}` })),
    ),
    ...[...fold.decisions.values()]
      .filter(({ entry }) => coverable.has(entry.id))
      .map(({ entry }) => ({ id: entry.id })),
  ].filter((claim, index, all) => all.findIndex((other) => other.id === claim.id) === index)
  const lines = ['## coverage', '']
  let uncovered = 0
  let attestationOnly = 0
  for (const claim of claims) {
    const origin = claim.from === undefined ? '' : ` (adopted from ${claim.from})`
    const entry = coverageByClaim.get(claim.id)
    if (!entry) {
      uncovered += 1
      lines.push(`- ${claim.id}${origin}: none`)
      continue
    }
    const kinds = entry.covered_by.map((coverage) => coverage.kind)
    if (kinds.every((kind) => kind === 'attestation')) {
      attestationOnly += 1
    }
    lines.push(`- ${claim.id}${origin}: ${kinds.join(', ')}`)
  }
  lines.push(
    '',
    `${claims.length} claims in force: ${claims.length - uncovered} covered, ${uncovered} uncovered, ${attestationOnly} on attestation alone; ${deferred} deferred excluded`,
    '',
  )
  return lines
}

const renderDelta = (product: Product, fold: Fold): string[] => {
  const folded: IncrementRef[] = [
    ...product.increments.filter((increment) => increment.number <= fold.at).map((increment) => increment.number),
    ...fold.drafts,
  ]
  const previous = folded.at(-2)
  const lines = [`## changes at increment ${fold.label}`, '']
  const added = [
    ...[...fold.requirements.values()].filter((claim) => claim.increment === fold.label).map((claim) => claim.entry.id),
    ...[...fold.decisions.values()].filter((claim) => claim.increment === fold.label).map((claim) => claim.entry.id),
  ]
  const closed = fold.outOfForce.filter((entry) => entry.increment === fold.label)
  if (added.length === 0 && closed.length === 0) {
    lines.push('(nothing declared)', '')
    return lines
  }
  if (added.length > 0) {
    lines.push(`added: ${added.join(', ')}`)
  }
  for (const entry of closed) {
    lines.push(
      entry.how === 'superseded' ? `superseded: ${entry.id} by ${entry.by}` : `retired: ${entry.id} — ${entry.by}`,
    )
  }
  lines.push('')
  if (previous !== undefined) {
    lines.push(`_previous increment: ${previous}_`, '')
  }
  return lines
}

const renderQuestions = (product: Product, fold: Fold): string[] => {
  const lines: string[] = []
  const sources = [
    ...product.increments.filter((candidate) => candidate.number <= fold.at),
    ...product.drafts.filter((candidate) => fold.drafts.includes(candidate.name)),
  ]
  for (const increment of sources) {
    for (const question of increment.questions?.data.questions ?? []) {
      lines.push(`- ${question.id} (${question.answer}): ${question.question.trim()}`)
    }
  }
  if (lines.length === 0) {
    return []
  }
  return ['## open questions blocking settle', '', ...lines, '']
}
