#!/usr/bin/env node
// Assemble the shippable Bedrock manifest into dist/, run by tsdown's onSuccess
// after every bundle (dev deploy, `pnpm build`, and publish). package.json is
// the single source of truth for the version (bumped by changesets); Bedrock
// wants a [major, minor, patch] triple, so the semver string is parsed, dropping
// any prerelease/build suffix, and written into the header and every module.
//
// The result — dist/manifest.json + dist/scripts/main.js — is a complete,
// installable behavior pack: published in the npm tarball (via `files: ["dist"]`)
// for ansible to download + install, and cp'd into the dev server by deploy.mjs.
import { readFileSync, writeFileSync } from 'node:fs'

const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
  .version.split(/[-+]/)[0]
  .split('.')
  .map((part) => Number.parseInt(part, 10))

const manifest = JSON.parse(readFileSync(new URL('./pack/manifest.json', import.meta.url), 'utf8'))
manifest.header.version = version
for (const module of manifest.modules ?? []) {
  module.version = version
}

writeFileSync(new URL('./dist/manifest.json', import.meta.url), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`pack manifest → dist/manifest.json (v${version.join('.')})`)
