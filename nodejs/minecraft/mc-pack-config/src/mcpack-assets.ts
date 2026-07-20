#!/usr/bin/env node
// Zip the built pack (dist/, manifest at the archive root) into
// .release-assets/<name>-<version>.mcpack — the Bedrock-standard installable
// format. This is the `release-assets` implementation repo-kit wires into
// every pack; the publish workflow runs it and attaches everything in
// .release-assets/ to the package's GitHub release. Run from the pack
// directory, after a build.
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import AdmZip from 'adm-zip'

const packageDir = process.cwd()
const distDir = resolve(packageDir, 'dist')
if (!existsSync(join(distDir, 'manifest.json'))) {
  console.error('dist/manifest.json not found — build the pack first')
  process.exit(1)
}

const { name, version } = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
  name: string
  version: string
}
const bareName = name.startsWith('@') ? name.split('/')[1] : name

const outDir = join(packageDir, '.release-assets')
mkdirSync(outDir, { recursive: true })
const artifact = `${bareName}-${version}.mcpack`

const zip = new AdmZip()
zip.addLocalFolder(distDir)
zip.writeZip(join(outDir, artifact))
console.log(`release asset → .release-assets/${artifact}`)
