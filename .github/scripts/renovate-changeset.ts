/**
 * Auto-generate the managed changeset for a Renovate dependency-update PR.
 *
 * Spec: docs/cicd/renovate-integration.md. This script is the §5 generator.
 *
 * Behavior (idempotent — derived entirely from the current diff vs base):
 *   - Writes exactly one file, `.changeset/renovate-<PR_NUMBER>.md`, and touches
 *     no other changeset (human changesets are preserved — §6.5).
 *   - A workspace package gets an entry iff its published surface changed: a
 *     `dependencies` / `optionalDependencies` / `peerDependencies` entry was
 *     bumped, directly in its package.json or via a default-`catalog:` value it
 *     consumes (§5.2–5.3). devDependencies never produce an entry (§5.5).
 *   - Bump type (§5.4): dependencies/optionalDependencies → patch; peer within
 *     the same major → patch; peer crossing a major → major. Per package, the
 *     max over its changed deps.
 *   - All workspace packages are eligible, including private ones (§5.6).
 *   - If nothing publishable changed (devDep/tooling-only PR), an EMPTY changeset
 *     is written so the change is still accounted for (§5.5).
 *
 * Runs under Node 24 native type-stripping (`node renovate-changeset.ts`): only
 * erasable TypeScript syntax. Not part of any tsconfig/eslint project, so keep it
 * self-contained and dependency-free. Fail-open: unexpected errors log and exit 0.
 *
 * Env: BASE_REF (default "main"), PR_TITLE (changeset summary), PR_NUMBER (file key).
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

type DepMap = Record<string, string>

interface WorkspacePackage {
  rel: string
  name: string | undefined
  raw: Record<string, any>
}

const RUNTIME_TYPES = ['dependencies', 'optionalDependencies', 'peerDependencies'] as const
const PATCH = 0
const MAJOR = 2
const RANK_NAME = ['patch', 'minor', 'major']
const DEFAULT_CATALOG = 'catalog:'

const BASE_REF = process.env.BASE_REF || 'main'
const PR_TITLE = process.env.PR_TITLE || 'chore(deps): update dependencies'
const PR_NUMBER = process.env.PR_NUMBER || 'unknown'
const repoRoot = process.cwd()

function git(args: string[], { allowFail = false }: { allowFail?: boolean } = {}): string {
  try {
    return execFileSync('git', args, { encoding: 'utf8', cwd: repoRoot }).trim()
  } catch (err) {
    if (allowFail) return ''
    throw err
  }
}

function showAtRef(ref: string, path: string): string | null {
  const out = git(['show', `${ref}:${path}`], { allowFail: true })
  return out === '' ? null : out
}

function readFileOr(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

function safeJson(text: string | null): Record<string, any> {
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

function findPackageJsons(): string[] {
  const roots = ['nodejs', 'tooling']
  const results: string[] = []
  const walk = (dir: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue
      const full = join(dir, entry)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) walk(full)
      else if (entry === 'package.json') results.push(full)
    }
  }
  for (const r of roots) walk(join(repoRoot, r))
  return results
}

/** Parse the DEFAULT `catalog:` block only. Named `catalogs:` are CI-rejected (§8). */
function parseCatalog(yamlText: string | null): DepMap {
  const map: DepMap = {}
  if (!yamlText) return map
  let inCatalog = false
  for (const line of yamlText.split('\n')) {
    if (/^catalog:\s*$/.test(line)) {
      inCatalog = true
      continue
    }
    if (!inCatalog) continue
    if (/^\S/.test(line)) break // a non-indented line ends the block
    const m = line.match(/^\s{2}(['"]?)([^'":]+)\1:\s*(.+?)\s*$/)
    if (m) map[m[2]] = m[3]
  }
  return map
}

/** Leading major integer of a range spec (`^19.2` → 19, `>=18 <20` → 18), or null. */
function majorOf(spec: string | undefined): number | null {
  if (!spec) return null
  const m = spec.match(/(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

/** True only when both specs parse and their majors differ (widening keeps the old major → false). */
function crossesMajor(baseSpec: string | undefined, headSpec: string | undefined): boolean {
  const b = majorOf(baseSpec)
  const h = majorOf(headSpec)
  return b !== null && h !== null && b !== h
}

function main(): void {
  git(['fetch', 'origin', BASE_REF], { allowFail: true })
  const base = `origin/${BASE_REF}`
  const managedRel = join('.changeset', `renovate-${PR_NUMBER}.md`)

  const changedFiles = new Set(
    git(['diff', '--name-only', `${base}...HEAD`], { allowFail: true }).split('\n').filter(Boolean),
  )

  // Default-catalog version maps at base and head (fan-out source, §5.3).
  const headCatalog = parseCatalog(readFileOr(join(repoRoot, 'pnpm-workspace.yaml')))
  const baseCatalog = parseCatalog(showAtRef(base, 'pnpm-workspace.yaml'))

  const packages: WorkspacePackage[] = findPackageJsons().map((abs) => {
    const rel = relative(repoRoot, abs)
    return { rel, name: safeJson(readFileOr(abs)).name, raw: safeJson(readFileOr(abs)) }
  })

  const affected = new Map<string, number>() // package name -> max bump rank

  for (const pkg of packages) {
    if (!pkg.name) continue

    // Base view of this package.json: identical to head unless its own file changed.
    let basePkg = pkg.raw
    if (changedFiles.has(pkg.rel)) {
      const loaded = safeJson(showAtRef(base, pkg.rel))
      if (Object.keys(loaded).length === 0) continue // new package — Renovate doesn't add these (§5.2)
      basePkg = loaded
    }

    let bump = -1
    for (const type of RUNTIME_TYPES) {
      const headDeps: DepMap = pkg.raw[type] || {}
      const baseDeps: DepMap = basePkg[type] || {}
      for (const name of new Set([...Object.keys(headDeps), ...Object.keys(baseDeps)])) {
        const headSpec = headDeps[name]
        const baseSpec = baseDeps[name]

        let changed = false
        let major = false
        if (headSpec === undefined || baseSpec === undefined) {
          changed = headSpec !== baseSpec // added or removed; magnitude unknowable → patch
        } else if (headSpec === DEFAULT_CATALOG) {
          const headEff = headCatalog[name]
          const baseEff = baseSpec === DEFAULT_CATALOG ? baseCatalog[name] : baseSpec
          changed = baseEff !== headEff || baseSpec !== headSpec
          major = crossesMajor(baseEff, headEff)
        } else {
          changed = baseSpec !== headSpec
          major = crossesMajor(baseSpec, headSpec)
        }

        if (!changed) continue
        const rank = type === 'peerDependencies' && major ? MAJOR : PATCH
        if (rank > bump) bump = rank
      }
    }

    if (bump >= 0) affected.set(pkg.name, bump)
  }

  writeFileSync(join(repoRoot, managedRel), renderChangeset(affected))
  if (affected.size > 0) {
    const summary = [...affected].map(([n, r]) => `${n}:${RANK_NAME[r]}`).join(', ')
    console.log(`Wrote ${managedRel} (${affected.size} package(s): ${summary})`)
  } else {
    console.log(`Wrote ${managedRel} (empty changeset — no published surface changed)`)
  }
}

function renderChangeset(affected: Map<string, number>): string {
  if (affected.size === 0) {
    return `---\n---\n\n${PR_TITLE}\n` // empty changeset — accounts for the change, no bump (§5.5)
  }
  const frontmatter = [...affected.keys()]
    .sort()
    .map((name) => `'${name}': ${RANK_NAME[affected.get(name) as number]}`)
    .join('\n')
  return `---\n${frontmatter}\n---\n\n${PR_TITLE}\n`
}

try {
  main()
} catch (err) {
  console.warn(`renovate-changeset: skipping (fail-open) — ${err instanceof Error ? err.message : String(err)}`)
  process.exit(0)
}
