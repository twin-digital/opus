#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getReleasedPackages, repoRootFrom } from '../lib/release/released-packages.js'

/**
 * Detects packages released at the current commit that produce GitHub release
 * assets — those exposing a `release-assets` script (the well-known hook: it
 * writes the artifacts to attach into the package's .release-assets/).
 *
 * Output: JSON array for the publish workflow's release-assets matrix —
 * [{name, version, path, tag}, ...] with `path` relative to the repo root.
 */
async function main() {
  const repoRoot = repoRootFrom(path.dirname(fileURLToPath(import.meta.url)))
  try {
    const packages = []
    for (const released of await getReleasedPackages(repoRoot)) {
      const manifest = JSON.parse(fs.readFileSync(path.join(released.dir, 'package.json'), 'utf8'))
      if (!manifest.scripts?.['release-assets']) {
        continue
      }
      packages.push({
        name: released.name,
        version: released.version,
        path: path.relative(repoRoot, released.dir),
        tag: released.tag,
      })
    }
    console.log(JSON.stringify(packages))
  } catch (error) {
    console.error('Error detecting release-asset packages:', error.message)
    process.exit(1)
  }
}

main()
