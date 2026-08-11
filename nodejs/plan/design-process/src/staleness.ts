import { foldProduct } from './fold.js'
import { FACT_ID } from './ids.js'
import { loadProducts } from './load.js'
import { loadPool } from './pools.js'

import type { PoolItem } from './pools.js'
import type { FileTree } from './tree.js'
import type { Finding } from './types.js'

/** What the fact-retirement gate reads of a backlog item (d-hxxlgaw9, d-dqwoto9x). */
export interface BacklogView {
  id: string
  product: string
  content: string
}

const FROZEN_CLAIMS = ['r-wgtyrh2r', 'd-vkudjo4x']

/** The substance of a pool entry: everything but the one edit retirement is allowed to make. */
const substance = (item: PoolItem): string => {
  const { status, reason, superseded_by, ...rest } = item.data
  void status
  void reason
  void superseded_by
  return canonicalize(rest)
}

const canonicalize = (value: unknown): string =>
  JSON.stringify(value, function replacer(this: unknown, _key: string, val: unknown) {
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      return Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
    }
    return val
  })

/**
 * A merged fact or run is frozen (r-wgtyrh2r, d-vkudjo4x): any base→head edit to a pool entry
 * beyond marking it retired — with its reason and its `superseded_by` where one exists — is a
 * finding, and so is removing one.
 */
export const checkPoolFrozen = (head: FileTree, base: FileTree): Finding[] => {
  const findings: Finding[] = []
  const headPool = loadPool(head)
  for (const item of loadPool(base).facts.concat(loadPool(base).runs)) {
    if (item.id === '') {
      continue
    }
    const now = headPool.byId.get(item.id)
    if (now?.kind !== item.kind) {
      findings.push({
        rule: 'pool-entry-frozen',
        claims: FROZEN_CLAIMS,
        path: item.path,
        message: `${item.id} is merged and may not be removed; retire it instead`,
      })
      continue
    }
    if (substance(now) !== substance(item)) {
      findings.push({
        rule: 'pool-entry-frozen',
        claims: FROZEN_CLAIMS,
        path: now.path,
        message: `${item.id} is merged and frozen; the one edit is marking it retired — write a new entry to say something different`,
      })
      continue
    }
    const wasRetired = item.data.status === 'retired'
    const closureEdited =
      item.data.status !== now.data.status ||
      item.data.reason !== now.data.reason ||
      item.data.superseded_by !== now.data.superseded_by
    if (wasRetired && closureEdited) {
      findings.push({
        rule: 'pool-entry-frozen',
        claims: FROZEN_CLAIMS,
        path: now.path,
        message: `${item.id} is already retired; its retirement is part of the frozen record`,
      })
    } else if (!wasRetired && closureEdited && now.data.status !== 'retired') {
      findings.push({
        rule: 'pool-entry-frozen',
        claims: FROZEN_CLAIMS,
        path: now.path,
        message: `${item.id} is merged and frozen; the one edit is marking it retired`,
      })
    }
  }
  return findings
}

/** The in-force foundations of each product citing the fact, in either spelling, by product id. */
const citersOf = (tree: FileTree, factId: string): Map<string, string[]> => {
  const byProduct = new Map<string, string[]>()
  // an opaque fact id is also cited bare; a slug id resolves only through the prefix
  const spellings = [`f:${factId}`, ...(FACT_ID.test(factId) ? [factId] : [])]
  const cites = (citations: string[] | undefined) => (citations ?? []).some((citation) => spellings.includes(citation))
  for (const product of loadProducts(tree).products.values()) {
    const fold = foldProduct(product, undefined, true)
    const citers = [
      ...[...fold.requirements.values()].filter(({ entry }) => cites(entry.informed_by)),
      ...[...fold.decisions.values()].filter(({ entry }) => cites(entry.because)),
    ].map(({ entry }) => entry.id)
    if (citers.length > 0) {
      byProduct.set(product.id, citers)
    }
  }
  return byProduct
}

/**
 * Retiring a cited fact is never refused, and the debt is captured (d-hxxlgaw9, r-ajpjx5w0): a
 * change retiring a fact that in-force foundations cite must carry a backlog item per citing
 * product, naming the retired fact. The backlog is read through the injected reader (d-dqwoto9x);
 * where none is given, or the read fails, the gate is skipped rather than guessed.
 */
export const checkFactRetirementDebt = (head: FileTree, base: FileTree, backlog: () => BacklogView[]): Finding[] => {
  const findings: Finding[] = []
  const basePool = loadPool(base)
  const retiredNow = loadPool(head).facts.filter(
    (item) =>
      item.id !== '' &&
      item.data.status === 'retired' &&
      basePool.byId.get(item.id) !== undefined &&
      basePool.byId.get(item.id)?.data.status !== 'retired',
  )
  if (retiredNow.length === 0) {
    return findings
  }
  let items: BacklogView[]
  try {
    items = backlog()
  } catch {
    return findings
  }
  for (const fact of retiredNow) {
    for (const [productId, citers] of citersOf(head, fact.id)) {
      const carried = items.some((item) => item.product === productId && item.content.includes(fact.id))
      if (!carried) {
        const replacement =
          typeof fact.data.superseded_by === 'string' ? ` and its replacement ${fact.data.superseded_by}` : ''
        findings.push({
          rule: 'fact-retirement-debt',
          claims: ['d-hxxlgaw9', 'r-ajpjx5w0'],
          path: fact.path,
          message:
            `retiring ${fact.id} strands ${citers.join(', ')} in ${productId}; ` +
            `the change carries a backlog item for ${productId} naming the fact${replacement} and the citing entries`,
          product: productId,
        })
      }
    }
  }
  return findings
}
