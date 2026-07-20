#!/usr/bin/env node
// Generate activation/world_behavior_packs.json from every behavior pack in the
// monorepo.
//
// A pack lands in the server's development_behavior_packs pool when compose
// watch syncs its dist/, but it isn't applied until it's listed in the world's
// world_behavior_packs.json. This regenerates that list; compose watch (see
// compose.yaml) ships it into the world and restarts the server. Re-run it
// whenever you add a pack or bump a pack's version.
//
// A "behavior pack" is any package with a pack/manifest.json. We anchor the
// walk at the monorepo root (not this dev harness) and collect each pack's uuid
// (from the manifest) + version (from package.json, the source of truth the
// build injects into the shipped manifest), so what's activated matches what
// gets deployed.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))

// Walk up to the monorepo root (the dir with pnpm-workspace.yaml).
let root = here
while (!existsSync(join(root, 'pnpm-workspace.yaml')) && root !== dirname(root)) {
  root = dirname(root)
}

// Discover nodejs/<group>/<package>/pack/manifest.json across the whole repo.
const packsDir = join(root, 'nodejs')
const packs = []
for (const group of readdirSync(packsDir, { withFileTypes: true })) {
  if (!group.isDirectory()) {
    continue
  }
  for (const pkg of readdirSync(join(packsDir, group.name), { withFileTypes: true })) {
    if (!pkg.isDirectory()) {
      continue
    }
    const manifest = join(packsDir, group.name, pkg.name, 'pack', 'manifest.json')
    if (!existsSync(manifest)) {
      continue
    }
    const { header } = JSON.parse(readFileSync(manifest, 'utf8'))
    // Version comes from package.json (a semver string), converted to Bedrock's
    // [major, minor, patch] triple, dropping any prerelease/build suffix.
    const { version } = JSON.parse(readFileSync(join(packsDir, group.name, pkg.name, 'package.json'), 'utf8'))
    const versionTriple = version
      .split(/[-+]/)[0]
      .split('.')
      .map((part) => Number.parseInt(part, 10))
    packs.push({ name: pkg.name, pack_id: header.uuid, version: versionTriple })
  }
}

packs.sort((a, b) => a.name.localeCompare(b.name))
const activation = packs.map(({ pack_id, version }) => ({ pack_id, version }))

writeFileSync(join(here, 'activation', 'world_behavior_packs.json'), `${JSON.stringify(activation, null, 2)}\n`)
console.log(
  `activation/world_behavior_packs.json: ${activation.length} pack(s)` +
    (packs.length ? ` — ${packs.map((p) => p.name).join(', ')}` : ''),
)
