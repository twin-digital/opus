#!/usr/bin/env node
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { $ } from 'execa'

import { repoRootFrom } from '../lib/release/released-packages.js'

/**
 * Attach a released package's build artifacts to its GitHub release:
 *
 *   upload-release-assets <tag> <package-dir-relative-to-repo-root>
 *
 * Uploads everything the package's `release-assets` script wrote to its
 * .release-assets/ directory, plus a generated SHA256SUMS (sha256sum format).
 * GitHub computes sha256 digests for assets, but only as API metadata;
 * SHA256SUMS is the downloadable companion so plain-URL consumers (ansible
 * get_url checksum:, sha256sum -c) can verify without an API call.
 */
async function main() {
  const [tag, packageDir] = process.argv.slice(2)
  if (!tag || !packageDir) {
    console.error('usage: upload-release-assets <tag> <package-dir>')
    process.exit(1)
  }

  const repoRoot = repoRootFrom(path.dirname(fileURLToPath(import.meta.url)))
  const assetsDir = path.join(repoRoot, packageDir, '.release-assets')
  const files = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir).filter((file) => file !== 'SHA256SUMS') : []
  if (files.length === 0) {
    console.error(`no release assets found in ${assetsDir} — did the release-assets script run?`)
    process.exit(1)
  }

  const sums = files
    .map(
      (file) =>
        `${createHash('sha256')
          .update(fs.readFileSync(path.join(assetsDir, file)))
          .digest('hex')}  ${file}`,
    )
    .join('\n')
  fs.writeFileSync(path.join(assetsDir, 'SHA256SUMS'), `${sums}\n`)

  const $$ = $({ cwd: repoRoot, stdio: 'inherit' })
  // The release normally already exists (changesets creates one per tag);
  // create it only when it is genuinely missing (a partial publish failure),
  // so an upload error isn't misread as "no release".
  try {
    await $({ cwd: repoRoot })`gh release view ${tag} --json id`
  } catch {
    await $$`gh release create ${tag} --verify-tag --title ${tag} --notes ${''}`
  }
  const paths = [...files, 'SHA256SUMS'].map((file) => path.join(assetsDir, file))
  await $$`gh release upload ${tag} ${paths} --clobber`
  console.log(`uploaded ${files.length + 1} asset(s) to ${tag}`)
}

main().catch((error) => {
  console.error('Error uploading release assets:', error.message)
  process.exit(1)
})
