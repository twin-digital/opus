#!/usr/bin/env node
// Generate world_behavior_packs.json from every behavior pack in the monorepo.
//
// A "behavior pack" is any package with a pack/manifest.json. We anchor the glob
// at the monorepo root (not this dev harness) and collect each pack's header
// uuid + version, so activating the dev world auto-includes every pack — no
// hand-maintained list. activate.sh runs this before copying the file in.
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
    packs.push({ name: pkg.name, pack_id: header.uuid, version: header.version })
  }
}

packs.sort((a, b) => a.name.localeCompare(b.name))
const activation = packs.map(({ pack_id, version }) => ({ pack_id, version }))

writeFileSync(join(here, 'world_behavior_packs.json'), `${JSON.stringify(activation, null, 2)}\n`)
console.log(
  `world_behavior_packs.json: ${activation.length} pack(s)` +
    (packs.length ? ` — ${packs.map((p) => p.name).join(', ')}` : ''),
)
