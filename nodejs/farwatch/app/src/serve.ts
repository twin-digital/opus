import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'

import {
  buildChroniclePrompt,
  CHRONICLE_DEFAULTS,
  listOllamaModels,
  listPromptOptions,
  selectLlm,
} from '@thrashplay/fw-chronicler'
import { createRng, hashSeed } from '@thrashplay/fw-core'
import { resolveAdventure } from '@thrashplay/fw-simulation'

// Load the monorepo-root .env before reading any env vars (CHRONICLER_LLM, AWS_*, etc.),
// exactly as main.ts does — the root is four levels up whether run from src/ or dist/.
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

/** What the inspector's prompt-builder form sends: a template, a snippet per axis, an example count. */
interface Selections {
  readonly template?: string
  readonly snippets?: Record<string, string>
  readonly exampleCount?: number
}

/**
 * Run one adventure for `seed` and return every fact the pipeline touched — hide nothing.
 *
 * `selections` are the prompt-builder choices (template + a snippet per axis); they go to
 * {@link buildChroniclePrompt}, which fills in {@link CHRONICLE_DEFAULTS} for anything omitted. The
 * composed prompt is returned alongside the completion so the page can show exactly what was sent.
 */
const run = async (seed: number, selections: Selections, model?: string) => {
  const result = resolveAdventure(createRng(hashSeed(seed)))
  const prompt = buildChroniclePrompt(result, selections)
  const startedAt = Date.now()
  const raw = await llm(prompt, model !== undefined && model !== '' ? { model } : undefined)
  const elapsedMs = Date.now() - startedAt
  // `chronicle()` is just `(await llm(buildChroniclePrompt(result))).trim()`; inlined here so the page can
  // show the prompt and the untrimmed completion alongside the trimmed prose it would return.
  return {
    seed,
    result,
    prompt,
    raw,
    chronicle: raw.trim(),
    elapsedMs,
    selections,
    model: model ?? process.env.CHRONICLER_MODEL ?? null,
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
        const { seed, selections, model } = JSON.parse(body || '{}') as {
          seed?: number
          selections?: Selections
          model?: string
        }
        if (typeof seed !== 'number' || !Number.isFinite(seed)) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: `invalid seed: ${JSON.stringify(seed)}` }))
          return
        }
        return run(seed, selections ?? {}, model).then((payload) => {
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

  if (url.pathname === '/models' && req.method === 'GET') {
    // Powers the inspector's model dropdown. Only the ollama backend exposes a model list; for any
    // other backend (or if ollama is unreachable) we return an empty list and the page hides it.
    const active = process.env.CHRONICLER_MODEL ?? null
    const backend = process.env.CHRONICLER_LLM ?? null
    if (backend !== 'ollama') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ backend, models: [], active }))
      return
    }
    listOllamaModels().then(
      (models) => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ backend, models, active }))
      },
      (error: unknown) => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            backend,
            models: [],
            active,
            error: error instanceof Error ? error.message : String(error),
          }),
        )
      },
    )
    return
  }

  if (url.pathname === '/options' && req.method === 'GET') {
    // Powers the prompt-builder form: the templates and snippet axes discovered on disk, the default
    // selection so the controls open on the active composition, and the example-count ceiling (the
    // number of seed adventures the gen-examples script narrates per combo).
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ...listPromptOptions(), defaults: CHRONICLE_DEFAULTS, maxExamples: 3 }))
    return
  }

  res.writeHead(404, { 'content-type': 'text/plain' })
  res.end('not found')
})

server.listen(port, () => {
  process.stderr.write(`farwatch inspector on http://localhost:${String(port)}\n`)
})
