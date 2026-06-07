import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { chronicle, selectLlm } from '@thrashplay/fw-chronicler'
import { createRng, hashSeed } from '@thrashplay/fw-core'
import { resolveAdventure } from '@thrashplay/fw-simulation'

// Load the monorepo-root .env before reading any env vars (CHRONICLER_LLM, AWS_*, etc.).
// The root is four levels up from this file (app/src → app → farwatch → nodejs → repo root),
// whether run from src/ or the built dist/.
const repoRoot = resolve(import.meta.dirname, '../../../..')
const envPath = join(repoRoot, '.env')
if (existsSync(envPath)) {
  process.loadEnvFile(envPath)
  process.stderr.write(`loaded env from ${envPath}\n`)
}

// End-to-end: seed -> resolve one adventure -> chronicle the pinned result.
// Backend is chosen by CHRONICLER_LLM (no default); selected first so it fails fast.
// Usage from the repo root: pnpm start [seed]
const llm = selectLlm()
const seed = Number(process.argv[2] ?? 1)
const result = resolveAdventure(createRng(hashSeed(seed)))

// Pinned facts (the sim's entire output) to stderr; the generated story to stdout.
process.stderr.write(`${JSON.stringify({ seed, ...result })}\n`)
process.stdout.write(`${await chronicle(result, llm)}\n`)
