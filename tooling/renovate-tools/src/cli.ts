import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCatalogs, type Catalogs } from './catalog.js'
import { bumpForPackage, effectiveRanges, RANK_NAME, RUNTIME_TYPES, type Manifest } from './ranges.js'
import { renderChangeset } from './changeset.js'
import { gitFetch, gitShow, repoRoot as findRepoRoot } from './git.js'
import { findManifestPaths } from './workspace.js'

const BASE_REF = process.env.BASE_REF ?? 'main'
const PR_TITLE = process.env.PR_TITLE ?? 'chore(deps): update dependencies'
const PR_NUMBER = process.env.PR_NUMBER ?? 'unknown'
const repoRoot = findRepoRoot()

/** A condition under which we cannot confidently compute the changeset — routed to the errored path. */
class DetectionError extends Error {}

const annotate = (message: string): void => {
  console.log(`::warning::renovate-changeset: ${message}`)
}

const parseManifest = (text: string, where: string): Manifest => {
  try {
    return JSON.parse(text) as Manifest
  } catch {
    throw new DetectionError(`could not parse ${where}`)
  }
}

const parseWorkspace = (text: string, where: string): Catalogs => {
  try {
    return parseCatalogs(text)
  } catch (err) {
    throw new DetectionError(`could not parse ${where}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** `${catalogName}:${dep}` keys whose range differs between base and head. */
const changedCatalogKeys = (base: Catalogs, head: Catalogs): Set<string> => {
  const changed = new Set<string>()
  for (const catalog of new Set([...Object.keys(base), ...Object.keys(head)])) {
    const b = base[catalog] ?? {}
    const h = head[catalog] ?? {}
    for (const dep of new Set([...Object.keys(b), ...Object.keys(h)])) {
      if (b[dep] !== h[dep]) {
        changed.add(`${catalog}:${dep}`)
      }
    }
  }
  return changed
}

/** Does this manifest consume any changed catalog entry under a runtime dependency type? */
const consumesChangedCatalogAtRuntime = (manifest: Manifest, changed: Set<string>): boolean => {
  for (const type of RUNTIME_TYPES) {
    for (const [dep, spec] of Object.entries(manifest[type] ?? {})) {
      if (!spec.startsWith('catalog:')) {
        continue
      }
      const catalogName = spec.slice('catalog:'.length) || 'default'
      if (changed.has(`${catalogName}:${dep}`)) {
        return true
      }
    }
  }
  return false
}

const main = (): void => {
  const base = `origin/${BASE_REF}`
  gitFetch(BASE_REF)

  // Catalogs at head (working tree) and base (git show). A parse failure here is errored — never
  // swallowed into "no catalogs", which would mis-resolve every `catalog:` reference.
  const headCatalogs = parseWorkspace(
    readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8'),
    'pnpm-workspace.yaml (head)',
  )
  const baseWs = gitShow(base, 'pnpm-workspace.yaml')
  const baseCatalogs = baseWs.ok ? parseWorkspace(baseWs.content, 'pnpm-workspace.yaml (base)') : {}

  const affected = new Map<string, number>()
  const misconfigurations: string[] = []
  let runtimeConsumerOfChangedCatalog = false
  const changedCatalogs = changedCatalogKeys(baseCatalogs, headCatalogs)

  for (const rel of findManifestPaths(repoRoot)) {
    const headManifest = parseManifest(readFileSync(join(repoRoot, rel), 'utf8'), `${rel} (head)`)
    if (!headManifest.name) {
      continue
    }

    if (consumesChangedCatalogAtRuntime(headManifest, changedCatalogs)) {
      runtimeConsumerOfChangedCatalog = true
    }

    // Branch on git show's exit status (§4.2): absent → new package (skip); present → parse, and a
    // throw is errored — NEVER `{}` (which would make every head dep look added → spurious patches).
    const baseShow = gitShow(base, rel)
    if (!baseShow.ok) {
      continue
    }
    const baseManifest = parseManifest(baseShow.content, `${rel} (base)`)

    const head = effectiveRanges(headManifest, headCatalogs)
    const baseRanges = effectiveRanges(baseManifest, baseCatalogs)
    misconfigurations.push(...head.misconfigurations, ...baseRanges.misconfigurations)

    const bump = bumpForPackage(baseRanges.ranges, head.ranges)
    if (bump !== null) {
      affected.set(headManifest.name, bump)
    }
  }

  // An unresolvable `catalog:` means we cannot trust the result — errored, not silently dropped.
  if (misconfigurations.length > 0) {
    throw new DetectionError(`unresolved catalog reference(s): ${[...new Set(misconfigurations)].join('; ')}`)
  }

  // Soft tripwire: a runtime-consumed catalog entry changed, yet nothing was affected — by
  // construction the consumer's effective range should have changed, so this signals a real bug.
  if (affected.size === 0 && runtimeConsumerOfChangedCatalog) {
    annotate('a runtime-consumed catalog entry changed but no package was affected — possible detection gap')
  }

  const managed = join('.changeset', `renovate-${PR_NUMBER}.md`)
  writeFileSync(join(repoRoot, managed), renderChangeset(affected, PR_TITLE))
  console.log(
    affected.size > 0 ?
      `Wrote ${managed}: ${[...affected].map(([name, rank]) => `${name}:${RANK_NAME[rank]}`).join(', ')}`
    : `Wrote ${managed} (empty changeset — no published surface changed)`,
  )
}

try {
  main()
} catch (err) {
  // Errored path (§4.4): annotate and write NOTHING (leave the managed file as-is); exit 0 so a
  // Renovate PR is never blocked. A throw must never masquerade as a clean empty/full changeset.
  annotate(err instanceof Error ? err.message : String(err))
  process.exit(0)
}
