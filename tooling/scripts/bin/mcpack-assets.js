#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

import AdmZip from 'adm-zip'

/**
 * Zip the built pack (dist/, manifest at the archive root) into
 * .release-assets/<name>-<version>.mcpack — the Bedrock-standard installable
 * format. This is the `release-assets` implementation repo-kit wires into
 * every behavior pack; the publish workflow runs it and attaches everything in
 * .release-assets/ to the package's GitHub release. Run from the pack
 * directory, after a build.
 */

const packageDir = process.cwd()
const distDir = path.join(packageDir, 'dist')
if (!fs.existsSync(path.join(distDir, 'manifest.json'))) {
  console.error('dist/manifest.json not found — build the pack first')
  process.exit(1)
}

const { name, version } = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'))
const bareName = name.startsWith('@') ? name.split('/')[1] : name

// The directory is exactly this run's output — clear it so a stale artifact
// from an earlier version can't ride along into the release upload.
const outDir = path.join(packageDir, '.release-assets')
fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })
const artifact = `${bareName}-${version}.mcpack`

const zip = new AdmZip()
zip.addLocalFolder(distDir)
zip.writeZip(path.join(outDir, artifact))
console.log(`release asset → .release-assets/${artifact}`)
