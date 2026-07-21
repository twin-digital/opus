#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getReleasedPackages, repoRootFrom } from '../lib/release/released-packages.js'

/**
 * Detects packages with Docker images that need to be published — packages
 * released at the current commit (git tags on HEAD) that have a Dockerfile.
 *
 * Output: JSON array for the publish workflow's docker matrix —
 * [{name, version, path, imageName}, ...] with `path` relative to the repo
 * root and imageName the GHCR image (@org/name -> ghcr.io/org/name).
 */
async function main() {
  const repoRoot = repoRootFrom(path.dirname(fileURLToPath(import.meta.url)))
  try {
    const packages = []
    for (const released of await getReleasedPackages(repoRoot)) {
      if (!fs.existsSync(path.join(released.dir, 'Dockerfile'))) {
        continue
      }
      packages.push({
        name: released.name,
        version: released.version,
        path: path.relative(repoRoot, released.dir),
        imageName: deriveImageName(released.name),
      })
    }
    console.log(JSON.stringify(packages))
  } catch (error) {
    console.error('Error detecting Docker packages:', error.message)
    process.exit(1)
  }
}

/**
 * Derive GHCR image name from npm package name
 * @twin-digital/codex -> ghcr.io/twin-digital/codex
 * package-name -> ghcr.io/twin-digital/package-name (assumes twin-digital org)
 */
function deriveImageName(packageName) {
  if (packageName.startsWith('@')) {
    return `ghcr.io/${packageName.slice(1)}`
  }
  return `ghcr.io/twin-digital/${packageName}`
}

main()
