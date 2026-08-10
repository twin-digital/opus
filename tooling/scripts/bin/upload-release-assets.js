#!/usr/bin/env node
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { $ } from 'execa'

/**
 * Attach a released package's build artifacts to its GitHub release:
 *
 *   upload-release-assets <tag> <package-dir-relative-to-repo-root>
 *
 * Uploads everything the package's `release-assets` script wrote to its
 * .release-assets/, plus a generated SHA256SUMS (sha256sum format). GitHub
 * computes sha256 digests for assets, but only as API metadata; SHA256SUMS is
 * the downloadable companion so plain-URL consumers (ansible `get_url
 * checksum:`, `sha256sum -c`) can verify without an API call.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

// A release asset is a flat file, so take the top-level regular files and ignore any
// directory the hook left behind. Sorted, for a SHA256SUMS that is byte-identical when
// the same release is re-run.
const assetFiles = (dir) => {
  if (!fs.existsSync(dir)) {
    return []
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== 'SHA256SUMS')
    .map((entry) => entry.name)
    .sort()
}

const writeChecksums = (dir, files) => {
  const sums = files.map((file) => {
    const digest = createHash('sha256')
      .update(fs.readFileSync(path.join(dir, file)))
      .digest('hex')
    return `${digest}  ${file}`
  })
  fs.writeFileSync(path.join(dir, 'SHA256SUMS'), `${sums.join('\n')}\n`)
}

async function main() {
  const [tag, packageDir] = process.argv.slice(2)
  if (!tag || !packageDir) {
    console.error('usage: upload-release-assets <tag> <package-dir>')
    process.exit(1)
  }

  const assetsDir = path.join(repoRoot, packageDir, '.release-assets')
  const files = assetFiles(assetsDir)
  if (files.length === 0) {
    // The hook ran and produced nothing to attach. Not an error: a package may
    // legitimately have assets for some releases and not others.
    console.log(`No release assets for ${tag}`)
    return
  }

  writeChecksums(assetsDir, files)

  const $$ = $({ cwd: repoRoot, stdio: 'inherit' })
  // The release normally already exists (changesets creates one per tag); create it only
  // when genuinely missing, so an upload error isn't misread as "no release".
  try {
    await $({ cwd: repoRoot })`gh release view ${tag} --json id`
  } catch {
    await $$`gh release create ${tag} --verify-tag --title ${tag} --notes ${''}`
  }

  const paths = [...files, 'SHA256SUMS'].map((file) => path.join(assetsDir, file))
  await $$`gh release upload ${tag} ${paths} --clobber`
  console.log(`uploaded ${paths.length} asset(s) to ${tag}`)
}

main().catch((error) => {
  console.error('Error uploading release assets:', error.message)
  process.exit(1)
})
