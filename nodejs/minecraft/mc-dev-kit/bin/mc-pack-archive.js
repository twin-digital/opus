#!/usr/bin/env node
// The mc-pack-archive launcher. Committed rather than generated, since it is the published bin
// entry; the compiled command sits in dist, which the `files` allowlist ships.

/** @type {string} */
const command = '../dist/internal/mc-pack-archive.js'
await import(command)
