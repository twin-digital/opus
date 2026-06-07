import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'

import {
  buildChroniclePrompt,
  chronicleView,
  chronicleZoomed,
  CHRONICLE_DEFAULTS,
  derivePalette,
  describePipelineNodes,
  listOllamaModels,
  listPipelines,
  listPromptOptions,
  runPipeline,
  runPipelineByName,
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

/**
 * Surface every failure to the terminal running the server. The render paths can make several LLM
 * calls (single-trial, pipelines), and an error escaping a request's promise chain would otherwise
 * crash the process silently — the page just sees "Failed to fetch" with no trace. We log the full
 * stack and, via the process-level handlers, keep serving rather than dying on the next stray reject.
 */
const logError = (where: string, error: unknown): void => {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error)
  process.stderr.write(`\n[inspector] ${where} failed:\n${detail}\n`)
}
process.on('unhandledRejection', (reason) => {
  logError('unhandledRejection', reason)
})
process.on('uncaughtException', (error) => {
  logError('uncaughtException', error)
})

// Dev-only inspector: the same seed -> resolve -> chronicle pipeline main.ts runs, served as a
// two-panel web page (chronicle prose | the fully-exposed guts). The LLM is selected once at
// startup so a bad CHRONICLER_LLM fails fast, before the server binds.
const llm = selectLlm()
const port = Number(process.env.PORT ?? 4178)
const pagePath = join(import.meta.dirname, 'inspector.html')

/**
 * What the inspector's form sends — either a single template run (template + a snippet per axis +
 * example count) or a pipeline run (pipeline name + per-call-node overrides, each keyed by the step's
 * `as`: the template to run at that node and the snippet selection for it).
 */
interface Selections {
  readonly template?: string
  readonly snippets?: Record<string, string>
  readonly exampleCount?: number
  readonly pipeline?: string
  readonly nodeOverrides?: Record<string, { template?: string; snippets?: Record<string, string> }>
}

/**
 * The standard adventure-derived values a single-template run provides, by placeholder name. A
 * template whose data placeholders are all drawn from here can be run on its own (the inspector wraps
 * it in a one-call skeleton pipeline that derives these and binds them); one that needs anything else
 * (per-trial `framing`, a prior `full_chronicle`, …) is a pipeline step, reached via its pipeline.
 */
const STANDARD_BINDINGS: Record<string, string> = {
  adventure: 'adventure',
  palette: 'palette',
  aims: 'aims',
  party: 'adventure.party',
  trials: 'adventure.trials',
  outcome: 'adventure.outcome',
  goal: 'adventure.goal',
  optionalGoals: 'adventure.optionalGoals',
}

/** Templates with dedicated standalone handlers in {@link run} (besides the skeleton path). */
const HANDLED_TEMPLATES = new Set(['chronicle', 'single-trial'])

/** Coerce a step's value (prose `{ text }`, or any JSON) to display text. */
const textOf = (value: unknown): string => {
  if (typeof value === 'string') {
    return value
  }
  if (value !== null && typeof value === 'object' && 'text' in value) {
    const text = (value as Record<string, unknown>).text
    if (typeof text === 'string') {
      return text
    }
  }
  return JSON.stringify(value, null, 2)
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
  const options = model !== undefined && model !== '' ? { model } : undefined
  const startedAt = Date.now()
  // The standard inputs every pipeline / skeleton run is given: the dice-free view and the per-
  // adventure diversity palette. Pipelines/templates bind whichever they declare; extras are ignored.
  const inputs = { adventure: chronicleView(result), palette: derivePalette(result) }

  // A pipeline run: feed the chronicle-legal view through the authored executor, then show the
  // declared `chronicle` output and the full per-step trace (each call's prompt, every step's output).
  if (selections.pipeline !== undefined) {
    const { out, trace } = await runPipelineByName(selections.pipeline, inputs, llm, {
      options,
      nodeOverrides: selections.nodeOverrides,
    })
    const elapsedMs = Date.now() - startedAt
    const divider = (label: string): string => `\n\n──────── ${label} ────────\n\n`
    return {
      seed,
      result,
      chronicle: textOf(out.chronicle),
      prompt: trace
        .filter((t) => t.prompt !== undefined)
        .map(
          (t) => divider(`${t.kind} · ${t.as}${t.template === undefined ? '' : ` (${t.template})`}`) + (t.prompt ?? ''),
        )
        .join(''),
      raw: trace.map((t) => divider(`${t.kind} · ${t.as}`) + textOf(t.output)).join(''),
      elapsedMs,
      selections,
      model: model ?? process.env.CHRONICLER_MODEL ?? null,
    }
  }

  // The `single-trial` template runs the "zoom in, then summarise" pipeline: narrate one beat at a
  // time (each told the story so far), then distil the beats into the finished chronicle. The page
  // reads the same fields — chronicle is the distilled summary; prompt/raw show every step (each
  // beat's prompt/output and the summary's) joined with dividers, so the rich draft stays visible.
  if (selections.template === 'single-trial') {
    const { beats, summaryPrompt, summary } = await chronicleZoomed(
      result,
      llm,
      { snippets: selections.snippets },
      options,
    )
    const elapsedMs = Date.now() - startedAt
    const divider = (label: string): string => `\n\n──────── ${label} ────────\n\n`
    return {
      seed,
      result,
      prompt:
        beats.map((b) => divider(`trial ${String(b.index + 1)} · prompt`) + b.prompt).join('') +
        divider('summary · prompt') +
        summaryPrompt,
      raw:
        beats.map((b) => divider(`trial ${String(b.index + 1)} · draft`) + b.narrative).join('') +
        divider('summary · finished') +
        summary,
      chronicle: summary,
      elapsedMs,
      selections,
      model: model ?? process.env.CHRONICLER_MODEL ?? null,
    }
  }

  // Any other template: wrap it in a one-call skeleton pipeline that derives the standard adventure
  // details and binds the template's placeholders to them — so e.g. `treatment` can be run and
  // inspected on its own. Structured templates yield JSON (shown as the chronicle output).
  if (selections.template !== undefined && selections.template !== 'chronicle') {
    const template = selections.template
    const use = listPromptOptions().templateUses[template]
    const bind: Record<string, string> = {}
    for (const placeholder of use.data) {
      if (!(placeholder in STANDARD_BINDINGS)) {
        throw new Error(
          `template "${template}" needs "${placeholder}", which a single run can't supply — run it via its pipeline`,
        )
      }
      bind[placeholder] = STANDARD_BINDINGS[placeholder]
    }
    const skeleton = {
      name: `single:${template}`,
      in: ['adventure', 'palette'],
      out: { result: 'result' },
      steps: [
        { as: 'aims', derive: 'pick' as const, from: 'adventure', fields: ['goal', 'optionalGoals'] },
        { as: 'result', call: template, bind },
      ],
    }
    const { out, trace } = await runPipeline(skeleton, inputs, llm, {
      options,
      configOverride: { [template]: selections.snippets ?? {} },
    })
    const elapsedMs = Date.now() - startedAt
    return {
      seed,
      result,
      chronicle: textOf(out.result),
      prompt: trace.find((t) => t.kind === 'call')?.prompt ?? '',
      raw: textOf(out.result),
      elapsedMs,
      selections,
      model: model ?? process.env.CHRONICLER_MODEL ?? null,
    }
  }

  const prompt = buildChroniclePrompt(result, selections)
  const raw = await llm(prompt, options)
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
        const label = selections?.pipeline ?? selections?.template ?? 'chronicle'
        process.stderr.write(`[inspector] /run seed=${String(seed)} (${label})…\n`)
        return run(seed, selections ?? {}, model).then((payload) => {
          process.stderr.write(`[inspector] /run seed=${String(seed)} ok in ${String(payload.elapsedMs)} ms\n`)
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify(payload))
        })
      })
      .catch((error: unknown) => {
        logError('/run', error)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          }),
        )
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
    // number of seed adventures the gen-examples script narrates per combo). Only templates that can
    // run on their own are offered — the ones with a dedicated handler, or whose data placeholders
    // are all standard adventure values (so the skeleton run can supply them). The rest are pipeline
    // steps (they need per-trial / prior bindings) and are reached by picking their pipeline.
    const options = listPromptOptions()
    const standard = new Set(Object.keys(STANDARD_BINDINGS))
    const templates = options.templates.filter(
      (name) => HANDLED_TEMPLATES.has(name) || options.templateUses[name].data.every((p) => standard.has(p)),
    )
    const pipelines = listPipelines().map((name) => describePipelineNodes(name))
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ...options, templates, pipelines, defaults: CHRONICLE_DEFAULTS, maxExamples: 3 }))
    return
  }

  res.writeHead(404, { 'content-type': 'text/plain' })
  res.end('not found')
})

server.listen(port, () => {
  process.stderr.write(`farwatch inspector on http://localhost:${String(port)}\n`)
})
