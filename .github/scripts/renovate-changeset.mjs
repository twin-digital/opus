#!/usr/bin/env node
// @ts-check
/**
 * Auto-generate a changeset for a Renovate dependency-update PR.
 *
 * A workspace package gets a `patch` changeset when its *runtime dependency
 * closure* changed — i.e. either:
 *   - a runtime `dependencies` entry in its own package.json was bumped, or
 *   - a `catalog:` entry it consumes at runtime (in pnpm-workspace.yaml) was bumped.
 *
 * devDependency / tooling bumps do NOT change a package's published output, so
 * they intentionally produce no changeset. If nothing publishable is affected
 * (e.g. a pure devtool/CI bump), the script exits without writing anything.
 *
 * Fail-open: any unexpected error logs a warning and exits 0 so a Renovate PR
 * is never blocked by this helper.
 *
 * Env:
 *   BASE_REF  - PR base branch (default "main")
 *   PR_TITLE  - used as the changeset summary
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'

const BASE_REF = process.env.BASE_REF || 'main'
const PR_TITLE = process.env.PR_TITLE || 'chore(deps): update dependencies'
const repoRoot = process.cwd()

/** Run git, returning stdout (trimmed) or '' on failure. */
function git(args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', cwd: repoRoot }).trim()
  } catch (err) {
    if (allowFail) return ''
    throw err
  }
}

/** Read a file at a git ref, or null if it does not exist there. */
function showAtRef(ref, path) {
  const out = git(['show', `${ref}:${path}`], { allowFail: true })
  return out === '' ? null : out
}

/** Recursively collect package.json paths under the workspace roots. */
function findPackageJsons() {
  const roots = ['nodejs', 'tooling']
  /** @type {string[]} */
  const results = []
  /** @param {string} dir */
  const walk = (dir) => {
    let entries
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

/**
 * Parse the default `catalog:` block of a pnpm-workspace.yaml document into a
 * { key: versionSpec } map. Deliberately minimal — the repo uses a single
 * default catalog with 2-space-indented, optionally single-quoted keys.
 */
function parseCatalog(yamlText) {
  /** @type {Record<string,string>} */
  const map = {}
  if (!yamlText) return map
  const lines = yamlText.split('\n')
  let inCatalog = false
  for (const line of lines) {
    if (/^catalog:\s*$/.test(line)) {
      inCatalog = true
      continue
    }
    if (!inCatalog) continue
    // a non-indented, non-empty line ends the block
    if (/^\S/.test(line)) break
    const m = line.match(/^\s{2}(['"]?)([^'":]+)\1:\s*(.+?)\s*$/)
    if (m) map[m[2]] = m[3]
  }
  return map
}

function main() {
  git(['fetch', 'origin', BASE_REF], { allowFail: true })
  const base = `origin/${BASE_REF}`

  const changedFiles = git(['diff', '--name-only', `${base}...HEAD`], { allowFail: true })
    .split('\n')
    .filter(Boolean)

  if (changedFiles.length === 0) {
    console.log('No changed files vs base; nothing to do.')
    return
  }

  // Already has a changeset? Respect it.
  if (changedFiles.some((f) => f.startsWith('.changeset/') && f.endsWith('.md') && !f.endsWith('README.md'))) {
    console.log('A changeset is already present in this PR; skipping.')
    return
  }

  // Index every workspace package: dir -> { name, runtimeDeps:Set, runtimeCatalogDeps:Set }
  const packages = findPackageJsons().map((abs) => {
    const rel = relative(repoRoot, abs)
    /** @type {any} */
    let pkg = {}
    try {
      pkg = JSON.parse(readFileSync(abs, 'utf8'))
    } catch {
      /* ignore unreadable package.json */
    }
    const runtime = pkg.dependencies || {}
    const runtimeDeps = new Set(Object.keys(runtime))
    const runtimeCatalogDeps = new Set(Object.keys(runtime).filter((d) => String(runtime[d]).startsWith('catalog:')))
    return { dir: dirname(rel), rel, name: pkg.name, runtimeDeps, runtimeCatalogDeps }
  })

  /** @type {Set<string>} package names to bump */
  const affected = new Set()

  // 1) Direct runtime-dependency bumps in a package's own package.json.
  for (const pkg of packages) {
    if (!pkg.name) continue
    if (!changedFiles.includes(pkg.rel)) continue
    const headPkg = safeJson(readFileSync(join(repoRoot, pkg.rel), 'utf8'))
    const basePkg = safeJson(showAtRef(base, pkg.rel))
    if (!basePkg) continue // new package — Renovate doesn't add these; skip
    if (runtimeDepsChanged(basePkg.dependencies, headPkg.dependencies)) {
      affected.add(pkg.name)
    }
  }

  // 2) Catalog runtime bumps in pnpm-workspace.yaml fan out to consumers.
  if (changedFiles.includes('pnpm-workspace.yaml')) {
    const headCatalog = parseCatalog(readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8'))
    const baseCatalog = parseCatalog(showAtRef(base, 'pnpm-workspace.yaml') || '')
    const changedKeys = new Set(
      [...new Set([...Object.keys(headCatalog), ...Object.keys(baseCatalog)])].filter(
        (k) => headCatalog[k] !== baseCatalog[k],
      ),
    )
    if (changedKeys.size > 0) {
      for (const pkg of packages) {
        if (!pkg.name) continue
        for (const dep of pkg.runtimeCatalogDeps) {
          if (changedKeys.has(dep)) {
            affected.add(pkg.name)
            break
          }
        }
      }
    }
  }

  if (affected.size === 0) {
    console.log('No publishable runtime dependencies changed; no changeset needed.')
    return
  }

  const names = [...affected].sort()
  const frontmatter = names.map((n) => `'${n}': patch`).join('\n')
  const sha = (git(['rev-parse', '--short', 'HEAD'], { allowFail: true }) || 'update').slice(0, 8)
  const body = `---\n${frontmatter}\n---\n\n${PR_TITLE}\n`
  const file = join(repoRoot, '.changeset', `renovate-${sha}.md`)
  writeFileSync(file, body)
  console.log(`Wrote ${relative(repoRoot, file)} bumping: ${names.join(', ')}`)
}

/** @param {string|null} text */
function safeJson(text) {
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

/** True if any runtime dependency key was added, removed, or had its spec changed. */
function runtimeDepsChanged(baseDeps = {}, headDeps = {}) {
  const keys = new Set([...Object.keys(baseDeps), ...Object.keys(headDeps)])
  for (const k of keys) {
    if (baseDeps[k] !== headDeps[k]) return true
  }
  return false
}

try {
  main()
} catch (err) {
  console.warn(`renovate-changeset: skipping (fail-open) — ${err instanceof Error ? err.message : String(err)}`)
  process.exit(0)
}
