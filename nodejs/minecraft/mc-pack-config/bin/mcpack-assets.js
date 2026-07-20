#!/usr/bin/env node
// Thin launcher: the implementation is src/mcpack-assets.ts, built to dist/.
// Committed (not generated) so pnpm can link the bin at install time, before a
// build exists; by the time the bin runs, the package is built.
await import('../dist/mcpack-assets.js')
