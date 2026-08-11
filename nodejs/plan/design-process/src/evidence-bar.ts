import { loadPool } from './pools.js'

import type { Pool, PoolItem, SchemaPool } from './pools.js'
import type { FileTree } from './tree.js'
import type { Finding } from './types.js'
import type { Ajv2020 } from 'ajv/dist/2020.js'
import type { ErrorObject, ValidateFunction } from 'ajv'

// The facts/evidence pool joins the version regime: every entry meets the evidence bar (d-a3agzjct),
// enforced here once repo-wide against the pool schemas rather than per product.
const CLAIMS = ['r-xxa1st52', 'd-a3agzjct']

/** off-repo iff the url carries a scheme; anything else is a path into this tree. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//
const IS_RELATIVE = /^\.\.?\//
const IN_ARTIFACTS = /(^|\/)artifacts\//

const FLOOR: Record<string, 'url' | 'run' | 'description'> = {
  tested: 'run',
  documented: 'url',
  assumed: 'description',
}

const normalise = (value: string): string => value.replace(/\s+/g, ' ').trim()

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

const formatAjvError = (error: ErrorObject): string =>
  `${error.instancePath === '' ? '(root)' : error.instancePath} ${error.message ?? 'is invalid'}`

/**
 * Enforce the evidence bar over the repo-wide facts + evidence pool: schema shape, the backing's
 * source floor, per-source locators and verbatim quotes, run resolution, and pool-wide id
 * uniqueness. Findings cite r-xxa1st52 and d-0e325noj.
 */
export const checkEvidenceBar = (tree: FileTree, schemaPool: SchemaPool, ajv: Ajv2020): Finding[] => {
  const findings: Finding[] = []
  const pool = loadPool(tree)
  findings.push(...pool.findings)

  checkSchemas(pool, schemaPool, ajv, findings)

  for (const item of pool.facts) {
    checkFact(item, pool, tree, findings)
  }
  for (const item of pool.runs) {
    checkRunOutput(item, tree, findings)
    checkSupersededBy(item, pool, findings)
  }

  // rule 8: ids are unique across the whole pool (facts and runs share one namespace)
  for (const duplicate of pool.duplicates) {
    findings.push({
      rule: 'pool-id-unique',
      claims: CLAIMS,
      path: duplicate.path,
      message: `${duplicate.id} is already declared elsewhere in the pool`,
    })
  }

  return findings
}

// rule 1: file shape via the pool schemas, when the tree ships them. A file validates against the
// version its own wrapper declares, so the pool dialects coexist (d-vkudjo4x, d-i47qv6oa);
// each wrapper $refs its entry schema, so one validation covers the version and every entry.
const checkSchemas = (pool: Pool, schemaPool: SchemaPool, ajv: Ajv2020, findings: Finding[]): void => {
  for (const file of pool.files) {
    const version = file.wrapper.version
    const declared = typeof version === 'string' || typeof version === 'number' ? String(version) : '1'
    const wrapperId = `/design-process/${file.kind === 'fact' ? 'facts' : 'runs'}@${declared}`
    validateAgainst(ajv, schemaPool, wrapperId, file.wrapper, file.path, findings)
  }
}

const validateAgainst = (
  ajv: Ajv2020,
  schemaPool: SchemaPool,
  schemaId: string,
  data: unknown,
  path: string,
  findings: Finding[],
): void => {
  if (!schemaPool.entries.has(schemaId)) {
    return // the tree does not ship this pool schema; shape is unenforceable here
  }
  let validate: ValidateFunction | undefined
  try {
    validate = ajv.getSchema(schemaId) as ValidateFunction | undefined
  } catch {
    return
  }
  if (!validate || validate(data)) {
    return
  }
  for (const error of validate.errors ?? []) {
    findings.push({ rule: 'pool-entry-schema', claims: CLAIMS, path, message: formatAjvError(error) })
  }
}

const checkFact = (item: PoolItem, pool: Pool, tree: FileTree, findings: Finding[]): void => {
  const { data, path } = item
  const tag = item.id || '(unnamed fact)'
  const backing = typeof data.backing === 'string' ? data.backing : undefined
  const sources = Array.isArray(data.sources) ? data.sources : []

  // rule 2: the backing demands one locator form as a floor
  const want = backing ? FLOOR[backing] : undefined
  if (want && sources.length > 0 && !sources.some((source) => asRecord(source)?.[want] !== undefined)) {
    findings.push({
      rule: 'source-floor',
      claims: CLAIMS,
      path,
      message: `${tag}: a ${backing} fact needs at least one source with a ${want}`,
    })
  }

  for (const raw of sources) {
    const source = asRecord(raw)
    if (!source) {
      continue
    }
    checkUrlSource(source, backing, tag, path, tree, findings)
    checkRunSource(source, backing, tag, path, pool, tree, findings)
  }

  checkSupersededBy(item, pool, findings)
}

const checkUrlSource = (
  source: Record<string, unknown>,
  backing: string | undefined,
  tag: string,
  path: string,
  tree: FileTree,
  findings: Finding[],
): void => {
  if (typeof source.url !== 'string') {
    return // absent, or a non-string the schema already flags
  }
  const url = source.url
  const quote = typeof source.quote === 'string' ? source.quote : undefined

  // rule 3: a url must not be a ../-relative path
  if (IS_RELATIVE.test(url)) {
    findings.push({
      rule: 'source-url-relative',
      claims: CLAIMS,
      path,
      message: `${tag}: url ${JSON.stringify(url)} is a relative path; cite repo-root-relative paths`,
    })
  } else if (!HAS_SCHEME.test(url)) {
    // rule 4: an in-repo url must exist and its quote be present verbatim
    const file = url.split('#')[0] ?? ''
    if (file.length > 0 && !tree.has(file)) {
      findings.push({
        rule: 'source-file-missing',
        claims: CLAIMS,
        path,
        message: `${tag}: url ${JSON.stringify(url)} resolves to no file in the tree`,
      })
    } else if (file.length > 0 && quote !== undefined) {
      quoteFinding(tree.read(file), quote, tag, `url ${JSON.stringify(url)}`, path, findings)
    }
  }

  // rule 6: an artifacts/ path is captured test output and backs only a tested fact
  if (backing !== 'tested' && IN_ARTIFACTS.test(url)) {
    findings.push({
      rule: 'artifact-source-tested',
      claims: CLAIMS,
      path,
      message: `${tag}: url ${JSON.stringify(url)} is under artifacts/ but the fact is ${backing ?? 'un-backed'}, not tested`,
    })
  }
}

const checkRunSource = (
  source: Record<string, unknown>,
  backing: string | undefined,
  tag: string,
  path: string,
  pool: Pool,
  tree: FileTree,
  findings: Finding[],
): void => {
  if (typeof source.run !== 'string') {
    return // absent, or a non-string the schema already flags
  }
  const runId = source.run
  const quote = typeof source.quote === 'string' ? source.quote : undefined
  const run = pool.byId.get(runId)

  // rule 5: the run resolves to a declared, non-retired run entry
  if (run?.kind !== 'run') {
    findings.push({
      rule: 'run-source-resolves',
      claims: CLAIMS,
      path,
      message: `${tag}: run source ${JSON.stringify(runId)} names no run in the pool`,
    })
  } else {
    if (run.data.status === 'retired') {
      findings.push({
        rule: 'run-source-retired',
        claims: CLAIMS,
        path,
        message: `${tag}: run source ${JSON.stringify(runId)} is retired`,
      })
    }
    // output existence is checked once per run entry; the quote belongs to the citing source
    if (typeof run.data.output === 'string' && quote !== undefined && tree.has(run.data.output)) {
      quoteFinding(tree.read(run.data.output), quote, tag, `run ${JSON.stringify(runId)}`, path, findings)
    }
  }

  // rule 5: a run source belongs only on a tested fact
  if (backing !== 'tested') {
    findings.push({
      rule: 'run-source-not-tested',
      claims: CLAIMS,
      path,
      message: `${tag}: run source ${JSON.stringify(runId)} on a ${backing ?? 'un-backed'} fact; a run backs only a tested fact`,
    })
  }
}

/**
 * A run's recorded output exists in the tree, whether or not a fact cites the run yet
 * (d-te89mei4). The entry's own claim about the tree is checked where it is made, so a broken
 * output surfaces in the commit that breaks it rather than in the later one that cites it.
 */
const checkRunOutput = (item: PoolItem, tree: FileTree, findings: Finding[]): void => {
  const output = item.data.output
  if (typeof output !== 'string' || tree.has(output)) {
    return // absent, or a non-string the schema already flags
  }
  findings.push({
    rule: 'run-output-missing',
    claims: [...CLAIMS, 'd-te89mei4'],
    path: item.path,
    message: `${item.id || '(unnamed run)'}: records output ${JSON.stringify(output)}, which is not in the tree`,
  })
}

const quoteFinding = (
  content: string,
  quote: string,
  tag: string,
  locator: string,
  path: string,
  findings: Finding[],
): void => {
  if (!normalise(content).includes(normalise(quote))) {
    findings.push({
      rule: 'quote-verbatim',
      claims: CLAIMS,
      path,
      message: `${tag}: quote for ${locator} is not present verbatim at its source`,
    })
  }
}

// rule 7: superseded_by resolves to some pool entry (fact or run) and is not the entry itself.
const checkSupersededBy = (item: PoolItem, pool: Pool, findings: Finding[]): void => {
  const target = item.data.superseded_by
  if (typeof target !== 'string') {
    return // absent, or a non-string the schema already flags
  }
  const tag = item.id || `(unnamed ${item.kind})`
  if (target === item.id) {
    findings.push({
      rule: 'superseded-by-resolves',
      claims: CLAIMS,
      path: item.path,
      message: `${tag}: superseded_by names itself`,
    })
  } else if (!pool.byId.has(target)) {
    findings.push({
      rule: 'superseded-by-resolves',
      claims: CLAIMS,
      path: item.path,
      message: `${tag}: superseded_by ${JSON.stringify(target)} names no pool entry`,
    })
  }
}
