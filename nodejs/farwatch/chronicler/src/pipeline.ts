import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { parse } from 'yaml'

import { buildPrompt, listPromptOptions, loadTemplate, type Llm, type LlmOptions } from './chronicle.js'
import { requestStructured } from './structured.js'

/**
 * A pipeline composes templated LLM calls and pure transforms into a multi-step narration. It is
 * authored as YAML (`pipelines/<name>.yaml`) and run by {@link runPipeline}: each step passes a
 * named JSON value through a lexically-scoped context, so a later step reads an earlier one by name.
 *
 * Three step kinds:
 * - **derive** — a pure transform (no LLM), e.g. `pick` fields off an object or `flatten` a list.
 * - **call** — fill a template (`prompts/<template>.md`) from bindings and run it through the LLM.
 *   The template's snippet axes (register/writing_style/…) are supplied by `config`, not bindings.
 * - **map** — run a body of steps once per item of a list, **sequentially**. The body's child scope
 *   adds `item` (the element) and `prior` (the body's outputs from earlier iterations); after the
 *   loop the map's value collects every body step's outputs into per-name lists.
 *
 * Values are JSON. Prose call output is wrapped `{ text }`. When a value is rendered into a template
 * placeholder, the dual render rules apply: a string is raw, `{ text }` unwraps, an array of
 * `{ text }` joins with blank lines, anything else is pretty JSON. (Derives see raw JSON, not text.)
 *
 * A `call` whose template declares an output schema (frontmatter `out:`) yields validated structured
 * JSON (see {@link requestStructured}); a plain template's output is wrapped `{ text }`.
 */
export interface Pipeline {
  readonly name: string
  /** Names the executor must be given as the root scope (e.g. `adventure`). */
  readonly in: readonly string[]
  /** What the run returns: result name → context path. Defaults to nothing. */
  readonly out?: Readonly<Record<string, string>>
  /** Per-template snippet selection (template → axis → snippet name); overridable at run time. */
  readonly config?: Readonly<Record<string, Readonly<Record<string, string>>>>
  readonly steps: readonly Step[]
}

export type Step = DeriveStep | CallStep | MapStep

interface StepBase {
  /** The context name this step's result is written under. */
  readonly as: string
}
export interface DeriveStep extends StepBase {
  readonly derive: 'pick' | 'flatten'
  /** Path to the input value. */
  readonly from: string
  /** `pick`: the fields to project. */
  readonly fields?: readonly string[]
  /** `flatten`: the list-valued field on each element to concatenate. */
  readonly path?: string
}
export interface CallStep extends StepBase {
  /** Template name — `prompts/<call>.md`. */
  readonly call: string
  /** Template placeholder → context path; rendered to a string at call time. */
  readonly bind?: Readonly<Record<string, string>>
}
export interface MapStep extends StepBase {
  /** Path to the list to iterate. */
  readonly map: string
  /** Name each element is bound under inside the body. */
  readonly item: string
  readonly body: readonly Step[]
}

/** One executed step, recorded for inspection: its name, kind, the prompt (calls), and its output. */
export interface TraceEntry {
  readonly as: string
  readonly kind: 'derive' | 'call' | 'map'
  readonly template?: string
  readonly prompt?: string
  readonly output: unknown
}

/** The result of a run: the declared `out` values, plus the full per-step trace. */
export interface PipelineRun {
  readonly out: Record<string, unknown>
  readonly trace: readonly TraceEntry[]
}

/** A lexically-scoped frame of name → JSON value; lookups walk outward to the parent. */
class Scope {
  private readonly values = new Map<string, unknown>()
  constructor(private readonly parent?: Scope) {}
  set(name: string, value: unknown): void {
    this.values.set(name, value)
  }
  lookup(name: string): unknown {
    if (this.values.has(name)) {
      return this.values.get(name)
    }
    if (this.parent) {
      return this.parent.lookup(name)
    }
    throw new Error(`pipeline: no value named "${name}" in scope`)
  }
  child(): Scope {
    return new Scope(this)
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The prose envelope: an object whose sole field is a string `text`. */
const isTextEnvelope = (value: unknown): value is { text: string } =>
  isObject(value) && typeof value.text === 'string' && Object.keys(value).length === 1

/**
 * Render a value into the string a template placeholder needs (the dual rules): a string is itself,
 * the `{ text }` envelope unwraps, an array of envelopes joins with blank lines (so accumulated prose
 * flows), and anything else serializes as pretty JSON.
 */
export const renderValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value
  }
  if (isTextEnvelope(value)) {
    return value.text
  }
  if (Array.isArray(value) && value.every(isTextEnvelope)) {
    return value.map((entry) => entry.text).join('\n\n')
  }
  return JSON.stringify(value, null, 2)
}

/** Resolve a dotted path against the scope chain: the head is a name lookup, the rest are field reads. */
const resolvePath = (scope: Scope, path: string): unknown => {
  const [head, ...rest] = path.split('.')
  let value = scope.lookup(head)
  for (const key of rest) {
    if (!isObject(value)) {
      throw new Error(`pipeline: cannot read "${key}" of a non-object in path "${path}"`)
    }
    value = value[key]
  }
  return value
}

const derivePick = (from: unknown, fields: readonly string[]): unknown => {
  if (!isObject(from)) {
    throw new Error('pipeline: `pick` needs an object input')
  }
  return Object.fromEntries(fields.map((field) => [field, from[field]]))
}

const deriveFlatten = (from: unknown, path: string): unknown => {
  if (!Array.isArray(from)) {
    throw new Error('pipeline: `flatten` needs a list input')
  }
  const out: unknown[] = []
  for (const element of from as unknown[]) {
    if (!isObject(element)) {
      throw new Error('pipeline: `flatten` needs a list of objects')
    }
    const inner = element[path]
    if (!Array.isArray(inner)) {
      throw new Error(`pipeline: \`flatten\` path "${path}" is not a list on every element`)
    }
    out.push(...(inner as unknown[]))
  }
  return out
}

/** What a run threads through every step: the LLM, the (possibly overridden) snippet config, the trace. */
interface RunContext {
  readonly llm: Llm
  readonly options?: LlmOptions
  readonly config: Record<string, Record<string, string>>
  readonly trace: TraceEntry[]
}

async function runSteps(steps: readonly Step[], scope: Scope, ctx: RunContext): Promise<void> {
  for (const step of steps) {
    await runStep(step, scope, ctx)
  }
}

async function runStep(step: Step, scope: Scope, ctx: RunContext): Promise<void> {
  if ('derive' in step) {
    const from = resolvePath(scope, step.from)
    const output = step.derive === 'pick' ? derivePick(from, step.fields ?? []) : deriveFlatten(from, step.path ?? '')
    scope.set(step.as, output)
    ctx.trace.push({ as: step.as, kind: 'derive', output })
    return
  }

  if ('call' in step) {
    const data: Record<string, string> = {}
    for (const [placeholder, path] of Object.entries(step.bind ?? {})) {
      data[placeholder] = renderValue(resolvePath(scope, path))
    }
    const prompt = buildPrompt({ template: step.call, snippets: ctx.config[step.call] ?? {}, data })
    // A template with an `out:` schema yields validated structured JSON; otherwise prose, wrapped `{ text }`.
    const schema = loadTemplate(step.call).out
    const output =
      schema === undefined ?
        { text: (await ctx.llm(prompt, ctx.options)).trim() }
      : await requestStructured(ctx.llm, prompt, schema, ctx.options)
    scope.set(step.as, output)
    ctx.trace.push({ as: step.as, kind: 'call', template: step.call, prompt, output })
    return
  }

  // map: sequential; child scope per item with `item` + `prior`, collecting body outputs per name.
  const list = resolvePath(scope, step.map)
  if (!Array.isArray(list)) {
    throw new Error(`pipeline: \`map\` source "${step.map}" is not a list`)
  }
  const collected: Record<string, unknown[]> = Object.fromEntries(step.body.map((s) => [s.as, []]))
  for (const item of list) {
    const child = scope.child()
    child.set(step.item, item)
    // A snapshot of the outputs from earlier iterations only — copy each list so a body step that
    // stores `prior` keeps the value as it was here, unaffected by the pushes below.
    child.set('prior', Object.fromEntries(Object.entries(collected).map(([name, list]) => [name, [...list]])))
    await runSteps(step.body, child, ctx)
    for (const s of step.body) {
      collected[s.as].push(child.lookup(s.as))
    }
  }
  scope.set(step.as, collected)
  ctx.trace.push({ as: step.as, kind: 'map', output: collected })
}

/**
 * Run a pipeline. `inputs` must supply every name in `pipeline.in`; `configOverride` merges over the
 * pipeline's per-template snippet config (the seam the inspector drives for testing). Returns the
 * declared `out` values and the full trace.
 */
export const runPipeline = async (
  pipeline: Pipeline,
  inputs: Readonly<Record<string, unknown>>,
  llm: Llm,
  opts?: {
    readonly options?: LlmOptions
    readonly configOverride?: Readonly<Record<string, Readonly<Record<string, string>>>>
  },
): Promise<PipelineRun> => {
  const root = new Scope()
  for (const name of pipeline.in) {
    if (!(name in inputs)) {
      throw new Error(`pipeline "${pipeline.name}": missing input "${name}"`)
    }
    root.set(name, inputs[name])
  }

  const config: Record<string, Record<string, string>> = {}
  for (const template of new Set([...Object.keys(pipeline.config ?? {}), ...Object.keys(opts?.configOverride ?? {})])) {
    config[template] = { ...pipeline.config?.[template], ...opts?.configOverride?.[template] }
  }

  const ctx: RunContext = { llm, options: opts?.options, config, trace: [] }
  await runSteps(pipeline.steps, root, ctx)

  const out: Record<string, unknown> = {}
  for (const [name, path] of Object.entries(pipeline.out ?? {})) {
    out[name] = resolvePath(root, path)
  }
  return { out, trace: ctx.trace }
}

const PIPELINES_DIR = join(import.meta.dirname, '..', 'pipelines')

/** Load and shape-check an authored pipeline from `pipelines/<name>.yaml`. */
export const loadPipeline = (name: string): Pipeline => {
  const parsed: unknown = parse(readFileSync(join(PIPELINES_DIR, `${name}.yaml`), 'utf8'))
  if (!isObject(parsed) || typeof parsed.name !== 'string' || !Array.isArray(parsed.steps)) {
    throw new Error(`pipeline "${name}": malformed (needs a name and a steps list)`)
  }
  return parsed as unknown as Pipeline
}

/** The authored pipelines available under `pipelines/`. */
export const listPipelines = (): string[] =>
  readdirSync(PIPELINES_DIR)
    .filter((file) => file.endsWith('.yaml'))
    .map((file) => file.slice(0, -'.yaml'.length))
    .sort()

/** The templates a pipeline calls, recursing into map bodies (in first-seen order). */
const callTemplates = (steps: readonly Step[]): string[] =>
  steps.flatMap((step) =>
    'call' in step ? [step.call]
    : 'map' in step ? callTemplates(step.body)
    : [],
  )

/** A pipeline's configurable surface, for the inspector: each template it calls, the snippet axes
 * that template uses, and the pipeline's default selection for them. */
export interface PipelineConfig {
  readonly name: string
  readonly templates: readonly {
    readonly template: string
    readonly axes: readonly string[]
    readonly defaults: Readonly<Record<string, string>>
  }[]
}

/** Describe a pipeline's configurable surface — used to build the inspector's per-pipeline controls. */
export const describePipeline = (name: string): PipelineConfig => {
  const pipeline = loadPipeline(name)
  const uses = listPromptOptions().templateUses
  const templates = [...new Set(callTemplates(pipeline.steps))].map((template) => ({
    template,
    axes: uses[template].axes,
    defaults: pipeline.config?.[template] ?? {},
  }))
  return { name, templates }
}

/** Convenience: load a pipeline by name and run it. */
export const runPipelineByName = (
  name: string,
  inputs: Readonly<Record<string, unknown>>,
  llm: Llm,
  opts?: Parameters<typeof runPipeline>[3],
): Promise<PipelineRun> => runPipeline(loadPipeline(name), inputs, llm, opts)
