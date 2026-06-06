import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import type { Adventure, Approach, Goal, Outcome, ResourceDelta } from '@thrashplay/fw-simulation'

/** Per-call options a backend may honour — generic, so each backend reads what it supports. */
export interface LlmOptions {
  /** Override the model the backend uses (a backend-specific id/tag). */
  readonly model?: string
  /** Extra backend-specific generation parameters, merged over the backend's defaults. */
  readonly params?: Record<string, unknown>
}

/** Anything that turns a prompt (and optional {@link LlmOptions}) into completion text. */
export type Llm = (prompt: string, options?: LlmOptions) => Promise<string>

/**
 * Prompts are composed, not monolithic. A **template** under `prompts/templates/` is the skeleton —
 * static prose plus `{{placeholder}}` markers — and each placeholder is filled from one of two
 * channels:
 *
 * - **snippets** — interchangeable Markdown files, so a section can be A/B/C-tested by name. A
 *   placeholder `{{writing_style}}` is filled from `prompts/writing-style/<name>.md` (the directory
 *   is the placeholder name, `_` → `-`, by convention — no registry in code).
 * - **data** — runtime strings computed per call (the serialized adventure), which have no file.
 *
 * {@link buildPrompt} validates that the two channels exactly cover the template's placeholders, so
 * a missing fill, a stray fill, or a typo'd snippet name fails loudly rather than leaking a literal
 * `{{...}}` into the prompt.
 */
export interface PromptSpec {
  /** Template name — `prompts/templates/<template>.md`. */
  readonly template: string
  /** Placeholder → snippet name, resolved from `prompts/<placeholder>/<name>.md`. */
  readonly snippets?: Readonly<Record<string, string>>
  /** Placeholder → literal runtime value (e.g. the serialized adventure). */
  readonly data?: Readonly<Record<string, string>>
}

/**
 * The prompt files live as plain Markdown so they can be edited without touching TypeScript. They
 * sit at the package root (a sibling of `src/`/`dist/`), so the same relative path resolves whether
 * this module runs from source (dev) or the built `dist/`, and the build never has to copy them.
 * Files are read fresh on each call, so edits show up live in the inspector with no rebuild.
 */
const PROMPTS_DIR = join(import.meta.dirname, '..', 'prompts')

/** Matches a `{{placeholder}}` marker; the capture group is the bare placeholder name. */
const PLACEHOLDER = /\{\{(\w+)\}\}/g

/** All distinct placeholder names appearing in a template, in no particular order. */
const placeholdersIn = (template: string): Set<string> => {
  const names = new Set<string>()
  for (const match of template.matchAll(PLACEHOLDER)) {
    names.add(match[1])
  }
  return names
}

/** Read the snippet that fills `{{placeholder}}`, by convention from `prompts/<placeholder>/<name>.md`. */
const readSnippet = (placeholder: string, name: string): string => {
  const dir = placeholder.replace(/_/g, '-')
  const path = join(PROMPTS_DIR, dir, `${name}.md`)
  try {
    return readFileSync(path, 'utf8').trimEnd()
  } catch {
    throw new Error(`chronicler: no snippet "${name}" for {{${placeholder}}} (looked for prompts/${dir}/${name}.md)`)
  }
}

/**
 * Compose a prompt from a template and its fills, validating that the fills exactly cover the
 * template's placeholders. Throws if a placeholder is unfilled, if a fill has no matching
 * placeholder (a typo), if the same placeholder is supplied by both channels, or if a named snippet
 * file is missing. Snippet bodies are leaves — they are inserted verbatim and never re-scanned for
 * placeholders, so a `{{...}}`-like string inside a snippet or the data passes through untouched.
 */
export const buildPrompt = (spec: PromptSpec): string => {
  const template = readFileSync(join(PROMPTS_DIR, 'templates', `${spec.template}.md`), 'utf8').trimEnd()
  const snippets = spec.snippets ?? {}
  const data = spec.data ?? {}

  const collision = Object.keys(snippets).filter((key) => key in data)
  if (collision.length > 0) {
    throw new Error(`chronicler: placeholder(s) supplied as both snippet and data: ${collision.join(', ')}`)
  }

  const needed = placeholdersIn(template)
  const supplied = new Set([...Object.keys(snippets), ...Object.keys(data)])

  const missing = [...needed].filter((key) => !supplied.has(key))
  if (missing.length > 0) {
    const list = missing.map((key) => `{{${key}}}`).join(', ')
    throw new Error(`chronicler: template "${spec.template}" has unfilled placeholder(s): ${list}`)
  }

  const stray = [...supplied].filter((key) => !needed.has(key))
  if (stray.length > 0) {
    throw new Error(`chronicler: fill(s) with no matching placeholder in "${spec.template}": ${stray.join(', ')}`)
  }

  const resolved: Record<string, string> = { ...data }
  for (const [placeholder, name] of Object.entries(snippets)) {
    resolved[placeholder] = readSnippet(placeholder, name)
  }

  return template.replace(PLACEHOLDER, (_match, key: string) => resolved[key] ?? `{{${key}}}`)
}

/**
 * A trial as the chronicler is allowed to see it: its approach, outcome, and the resource movements
 * that actually landed at *this* beat — `cost` (paid up front, win or lose), `stake` (a loss, only on
 * a failed trial), and `prize` (a gain, only on a won trial). Keeping them on the trial gives the
 * model the join the flat ledger could not: it knows *which* beat won the relic or cost the standing.
 */
interface TrialView {
  readonly approach: Approach
  readonly outcome: Outcome
  readonly cost?: ResourceDelta
  readonly stake?: ResourceDelta
  readonly prize?: ResourceDelta
}

/** A secondary aim as the chronicler sees it: its reward and whether the party achieved it. */
interface OptionalGoalView {
  readonly reward: ResourceDelta
  readonly won: boolean
}

/** An adventure as the chronicler is allowed to see it. @see chronicleView */
interface AdventureView {
  readonly goal: Goal
  readonly optionalGoals: readonly OptionalGoalView[]
  readonly trials: readonly TrialView[]
  readonly outcome: Outcome
}

/**
 * Project an adventure to the chronicle-legal view: the same graph shape with the resolver's
 * mechanical numbers (`roll`, `target`) dropped. The chronicle stays clean of numbers — *expose
 * the dice, hide the genome* — and the surest way to keep dice out of the prose is to never hand
 * them to the model. The goal (the aim), each trial's approach and outcome, the overall outcome,
 * and the resource movements (what was won and lost) all survive — none of which is dice.
 *
 * The movements ride *on their trial* rather than in a flat ledger, so the model knows which beat
 * produced each gain or loss: a trial shows its `cost` (paid up front), its `stake` only when it
 * failed (a realized loss), and its `prize` only when it won (a realized gain). The goal's `reward`
 * is carried home exactly when the overall `outcome` is a success — the resolver's flat ledger isn't
 * handed over, since every entry it held is now attributed to its trial, its optional, or the goal.
 * As the genome grows (seekers, a defied edict's *because*) those facts join this view, and the
 * template's schema section grows with it.
 */
const chronicleView = (adventure: Adventure): AdventureView => ({
  goal: adventure.goal,
  optionalGoals: adventure.optionalGoals.map((opt) => ({
    reward: opt.reward,
    won: adventure.trials[opt.trial].outcome === 'success',
  })),
  trials: adventure.trials.map((trial) => ({
    approach: trial.approach,
    outcome: trial.outcome,
    ...(trial.cost ? { cost: trial.cost } : {}),
    ...(trial.stake && trial.outcome === 'failure' ? { stake: trial.stake } : {}),
    ...(trial.prize && trial.outcome === 'success' ? { prize: trial.prize } : {}),
  })),
  outcome: adventure.outcome,
})

/** Serialize the chronicle-legal view as the JSON the template drops into `<adventure>`. */
export const renderAdventure = (adventure: Adventure): string => JSON.stringify(chronicleView(adventure), null, 2)

/**
 * The default chronicle composition — the active selection across the snippet axes, plus how many
 * few-shot examples to include. `register` (the narrator's voice/stance) and `writing_style` (how
 * ornate the prose is) are independent: a register reads the same matter through a chosen stance,
 * the writing style dials its ornament up or down. Swap any name to A/B-test.
 */
export const CHRONICLE_DEFAULTS = {
  template: 'chronicle',
  snippets: { register: 'legendary', writing_style: 'mythic', invention: 'descriptive' },
  exampleCount: 3,
} as const

/** The storage key for a combo's examples: its snippet selection, as sorted `placeholder=value` pairs. */
export const examplesKey = (snippets: Readonly<Record<string, string>>): string =>
  Object.keys(snippets)
    .sort()
    .map((placeholder) => `${placeholder}=${snippets[placeholder]}`)
    .join('__')

/** Matches one stored `<example>…</example>` block. */
const EXAMPLE_BLOCK = /<example>[\s\S]*?<\/example>/g

/**
 * Load up to `count` few-shot examples for a snippet selection, from `prompts/examples/<key>.md`
 * (see {@link examplesKey}). Examples are tied to the selection so the few-shots always match the
 * voice being asked for — they are generated per combo by the `gen-examples` script. A combo with
 * no file yet (newly added, or never generated) falls back to no examples rather than failing, so
 * the prompt is simply zero-shot until the script is run. Returns the `## Examples` section, or `''`.
 */
export const loadExamples = (snippets: Readonly<Record<string, string>>, count: number): string => {
  if (count <= 0) {
    return ''
  }
  let text: string
  try {
    text = readFileSync(join(PROMPTS_DIR, 'examples', `${examplesKey(snippets)}.md`), 'utf8')
  } catch {
    return ''
  }
  const blocks = (text.match(EXAMPLE_BLOCK) ?? []).slice(0, count)
  return blocks.length > 0 ? `## Examples\n\n${blocks.join('\n\n')}` : ''
}

/**
 * Build the chronicler's prompt for a resolved adventure, starting from {@link CHRONICLE_DEFAULTS}.
 *
 * The only established fact handed to the model is the chronicle-legal view (see
 * {@link chronicleView}); whatever it must invent beyond that is the gap we read the output to
 * measure. `overrides` swaps the template, any snippet (e.g. `{ snippets: { register: 'annalist' } }`),
 * or the example count for comparison without disturbing the rest. Examples follow the selection:
 * they are filled from the combo's generated set (see {@link loadExamples}), so changing a snippet
 * also changes the few-shots to match.
 */
export const buildChroniclePrompt = (
  adventure: Adventure,
  overrides?: {
    readonly template?: string
    readonly snippets?: Readonly<Record<string, string>>
    readonly exampleCount?: number
  },
): string => {
  const snippets = { ...CHRONICLE_DEFAULTS.snippets, ...overrides?.snippets }
  const count = overrides?.exampleCount ?? CHRONICLE_DEFAULTS.exampleCount
  return buildPrompt({
    template: overrides?.template ?? CHRONICLE_DEFAULTS.template,
    snippets,
    data: { adventure: renderAdventure(adventure), examples: loadExamples(snippets, count) },
  })
}

/** The snippet axes (one per `prompts/<dir>/`) and templates available to compose a prompt. */
export interface PromptOptions {
  /** Template names under `prompts/templates/`. */
  readonly templates: readonly string[]
  /** One entry per snippet directory: the placeholder it fills and the snippet names to choose from. */
  readonly axes: readonly { readonly placeholder: string; readonly options: readonly string[] }[]
}

/**
 * Discover the composable prompt pieces on disk, by convention: every directory under `prompts/`
 * except `templates/` is a snippet axis whose placeholder is its name (`-` → `_`). Lets a UI build
 * its controls from the filesystem, so dropping in a new snippet file makes it selectable with no
 * code change.
 */
export const listPromptOptions = (): PromptOptions => {
  const mdNames = (dir: string): string[] =>
    readdirSync(join(PROMPTS_DIR, dir))
      .filter((file) => file.endsWith('.md'))
      .map((file) => file.slice(0, -'.md'.length))
      .sort()
  // `examples/` is excluded: it is not a pickable axis but a data store of generated few-shots,
  // keyed by the other axes' selection (see loadExamples / the gen-examples script).
  const axes = readdirSync(PROMPTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'templates' && entry.name !== 'examples')
    .map((entry) => ({ placeholder: entry.name.replace(/-/g, '_'), options: mdNames(entry.name) }))
    .sort((a, b) => a.placeholder.localeCompare(b.placeholder))
  return { templates: mdNames('templates'), axes }
}

/** Resolve an adventure into prose via the given {@link Llm}, forwarding any {@link LlmOptions}. */
export const chronicle = async (adventure: Adventure, llm: Llm, options?: LlmOptions): Promise<string> =>
  (await llm(buildChroniclePrompt(adventure), options)).trim()
