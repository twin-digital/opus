import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'

import { buildPrompt, selectLlm } from '@thrashplay/fw-chronicler'
import { createRng, hashSeed } from '@thrashplay/fw-core'
import { resolveAdventure } from '@thrashplay/fw-simulation'

// Load the monorepo-root .env before reading any env vars (CHRONICLER_LLM, AWS_*, etc.),
// exactly as main.ts does — the root is three levels up whether run from src/ or dist/.
const repoRoot = resolve(import.meta.dirname, '../../../..')
const envPath = join(repoRoot, '.env')
if (existsSync(envPath)) {
  process.loadEnvFile(envPath)
  process.stderr.write(`loaded env from ${envPath}\n`)
}

// Dev-only inspector: the same seed -> resolve -> chronicle pipeline main.ts runs, served as a
// two-panel web page (chronicle prose | the fully-exposed guts). The LLM is selected once at
// startup so a bad CHRONICLER_LLM fails fast, before the server binds.
const llm = selectLlm()
const port = Number(process.env.PORT ?? 4178)
const pagePath = join(import.meta.dirname, 'inspector.html')

/**
 * Run one adventure for `seed` and return every fact the pipeline touched — hide nothing.
 *
 * `override` lets the Edit panel send a prompt verbatim instead of the generated one; an empty
 * override falls back to {@link buildPrompt}. Both the generated default and what was actually
 * sent are returned, so the page can flag whether this run was overridden.
 */
const run = async (seed: number, override?: string) => {
  const result = resolveAdventure(createRng(hashSeed(seed)))
  const defaultPrompt = buildPrompt(result)
  const prompt = override && override.length > 0 ? override : defaultPrompt
  const startedAt = Date.now()
  const raw = await llm(prompt)
  const elapsedMs = Date.now() - startedAt
  // `chronicle()` is just `(await llm(buildPrompt(result))).trim()`; inlined here so the page can
  // show the prompt and the untrimmed completion alongside the trimmed prose it would return.
  return {
    seed,
    result,
    defaultPrompt,
    prompt,
    raw,
    chronicle: raw.trim(),
    elapsedMs,
    overridden: prompt !== defaultPrompt,
  }
}

/** Read an entire request body as a UTF-8 string. */
const readBody = async (req: { [Symbol.asyncIterator](): AsyncIterator<Buffer> }): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${String(port)}`)

  if (url.pathname === '/') {
    // Read per request so editing the page reloads on refresh without restarting the server.
    readFile(pagePath, 'utf8').then(
      (html) => {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(html)
      },
      (error: unknown) => {
        res.writeHead(500, { 'content-type': 'text/plain' })
        res.end(String(error))
      },
    )
    return
  }

  if (url.pathname === '/run' && req.method === 'POST') {
    readBody(req)
      .then((body) => {
        const { seed, prompt } = JSON.parse(body || '{}') as { seed?: number; prompt?: string }
        if (typeof seed !== 'number' || !Number.isFinite(seed)) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: `invalid seed: ${JSON.stringify(seed)}` }))
          return
        }
        return run(seed, prompt).then((payload) => {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify(payload))
        })
      })
      .catch((error: unknown) => {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
      })
    return
  }

  res.writeHead(404, { 'content-type': 'text/plain' })
  res.end('not found')
})

server.listen(port, () => {
  process.stderr.write(`farwatch inspector on http://localhost:${String(port)}\n`)
})
