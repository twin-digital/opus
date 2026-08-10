#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { $ } from 'execa'

/**
 * Of the packages changesets just published, the ones that produce GitHub
 * release assets — those declaring a `release-assets` script (the well-known
 * hook: it writes the artifacts to attach into the package's .release-assets/).
 *
 * Reads the changesets action's `publishedPackages` output from
 * PUBLISHED_PACKAGES. Writes [{name, version, path, tag}, ...] to stdout, with
 * `path` relative to the repo root and `tag` the git tag changesets pushed.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

const parsePublished = (raw) => {
  if (!raw) {
    console.error('usage: PUBLISHED_PACKAGES=<changesets json> release-asset-packages')
    process.exit(1)
  }
  const published = JSON.parse(raw)
  if (!Array.isArray(published)) {
    throw new Error('PUBLISHED_PACKAGES is not an array')
  }
  return published
}

const workspaceDirs = async () => {
  const { stdout } = await $({ cwd: repoRoot })`pnpm list --json --recursive --depth=-1`
  return new Map(
    JSON.parse(stdout)
      .filter((workspace) => workspace.name && workspace.path)
      .map((workspace) => [workspace.name, workspace.path]),
  )
}

const hasReleaseAssets = (dir) => {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  return Boolean(manifest.scripts?.['release-assets'])
}

async function main() {
  const published = parsePublished(process.env.PUBLISHED_PACKAGES)
  const dirs = await workspaceDirs()

  const packages = []
  for (const { name, version } of published) {
    const dir = dirs.get(name)
    if (!dir) {
      console.error(`Warning: no workspace package named ${name}`)
      continue
    }
    if (!hasReleaseAssets(dir)) {
      continue
    }
    packages.push({ name, version, path: path.relative(repoRoot, dir), tag: `${name}@${version}` })
  }

  console.log(JSON.stringify(packages))
}

main().catch((error) => {
  console.error('Error detecting release-asset packages:', error.message)
  process.exit(1)
})
