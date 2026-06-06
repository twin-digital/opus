import type { Llm } from './chronicle.js'

/** Normalize a host into a base URL: add an `http://` scheme if bare, drop trailing slashes. */
const normalizeHost = (raw: string): string => {
  const withScheme = /^https?:\/\//.test(raw) ? raw : `http://${raw}`
  return withScheme.replace(/\/+$/, '')
}

/** The Ollama server base URL, read per call (after the app's `.env` loads). */
const ollamaHost = (): string => normalizeHost(process.env.OLLAMA_HOST ?? 'http://localhost:11434')

/** The fields we read from Ollama's `/api/generate` (non-streaming) response. */
interface GenerateResponse {
  readonly response?: string
  readonly error?: string
}

/** Default generation parameters, tuned for gemma4:12b. A call's `params` merge over these. */
const DEFAULT_OPTIONS = {
  temperature: 1.0,
  min_p: 0.05,
  top_p: 1.0,
  top_k: 0,
  repeat_penalty: 1.05,
  repeat_last_n: 256,
  num_ctx: 16384,
  num_predict: 2048,
}

/**
 * An {@link Llm} backed by a self-hosted Ollama server (`POST /api/generate`, non-streaming) —
 * for chronicling against local/open models with no cloud dependency.
 *
 * The model comes from the call's `options.model`, falling back to `CHRONICLER_MODEL`, then
 * `llama3.1`; the server is `OLLAMA_HOST` (a bare `host:port` is accepted; default localhost).
 * Both are read per call, since the app loads its `.env` only after this module is imported.
 * Thinking is disabled (`think: false`); `options.params` merge over the tuned
 * {@link DEFAULT_OPTIONS}. No timeout, since local models can be slow.
 */
export const ollama: Llm = async (prompt, options) => {
  const model = options?.model ?? process.env.CHRONICLER_MODEL ?? 'llama3.1'
  const url = `${ollamaHost()}/api/generate`
  const body = {
    model,
    prompt,
    stream: false,
    think: false,
    options: { ...DEFAULT_OPTIONS, ...(options?.params ?? {}) },
  }
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (cause) {
    throw new Error(`ollama: could not reach ${url} (is OLLAMA_HOST right and the server up?)`, { cause })
  }
  if (!res.ok) {
    throw new Error(`ollama ${url} -> ${res.status} ${res.statusText}: ${await res.text()}`)
  }
  const data = (await res.json()) as GenerateResponse
  if (data.error !== undefined) {
    throw new Error(`ollama error (model "${model}"): ${data.error}`)
  }
  if (data.response === undefined) {
    throw new Error('ollama returned no `response` field')
  }
  return data.response
}

/** The fields we read from Ollama's `/api/tags` response. */
interface TagsResponse {
  readonly models?: readonly { readonly name?: string }[]
}

/** List the model tags installed on the Ollama server (`GET /api/tags`), sorted. */
export const listOllamaModels = async (): Promise<string[]> => {
  const url = `${ollamaHost()}/api/tags`
  let res: Response
  try {
    res = await fetch(url)
  } catch (cause) {
    throw new Error(`ollama: could not reach ${url} (is OLLAMA_HOST right and the server up?)`, { cause })
  }
  if (!res.ok) {
    throw new Error(`ollama ${url} -> ${res.status} ${res.statusText}`)
  }
  const data = (await res.json()) as TagsResponse
  return (data.models ?? [])
    .map((entry) => entry.name)
    .filter((name): name is string => typeof name === 'string')
    .sort((a, b) => a.localeCompare(b))
}
