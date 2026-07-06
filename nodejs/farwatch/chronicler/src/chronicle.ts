import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { AFFINITY_WORDS, COMPETENCE_WORDS, RATING_MIN, skillFor } from '@thrashplay/fw-simulation'
import type { Adventure, Approach, Goal, Outcome, ResourceDelta, Seeker } from '@thrashplay/fw-simulation'
import { parse } from 'yaml'

/** Per-call options a backend may honour — generic, so each backend reads what it supports. */
export interface LlmOptions {
  /** Override the model the backend uses (a backend-specific id/tag). */
  readonly model?: string
  /** Extra backend-specific generation parameters, merged over the backend's defaults. */
  readonly params?: Record<string, unknown>
  /**
   * A JSON Schema for structured output. Backends that support it natively (ollama's `format`)
   * constrain generation to it; others ignore it. {@link requestStructured} sets this and validates
   * the result regardless, so native output and text-parsing both end up validated.
   */
  readonly schema?: unknown
}

/** Anything that turns a prompt (and optional {@link LlmOptions}) into completion text. */
export type Llm = (prompt: string, options?: LlmOptions) => Promise<string>

/**
 * Prompts are composed, not monolithic. A **template** under `prompts/templates/` is the skeleton —
 * static prose plus `{{placeholder}}` markers — and each placeholder is filled from one of two
 * channels:
 *
 * - **snippets** — interchangeable Markdown files, so a section can be A/B/C-tested by name. A
 *   placeholder `{{writing_style}}` is filled from `snippets/writing-style/<name>.md` (the directory
 *   is the placeholder name, `_` → `-`, by convention — no registry in code).
 * - **data** — runtime strings computed per call (the serialized adventure), which have no file.
 *
 * {@link buildPrompt} validates that the two channels exactly cover the template's placeholders, so
 * a missing fill, a stray fill, or a typo'd snippet name fails loudly rather than leaking a literal
 * `{{...}}` into the prompt.
 */
export interface PromptSpec {
  /** Template name — `prompts/<template>.md`. */
  readonly template: string
  /** Placeholder → snippet name, resolved from `snippets/<placeholder>/<name>.md`. */
  readonly snippets?: Readonly<Record<string, string>>
  /** Placeholder → literal runtime value (e.g. the serialized adventure). */
  readonly data?: Readonly<Record<string, string>>
}

/**
 * The authored prompt content lives as plain Markdown at the package root (a sibling of `src/`/
 * `dist/`), split into three directories so the same relative path resolves whether this module runs
 * from source (dev) or the built `dist/`, and the build never has to copy them:
 *
 * - `prompts/<template>.md` — the templates (skeletons with `{{placeholder}}` markers)
 * - `snippets/<axis>/<name>.md` — the interchangeable, shared snippet pools (one dir per axis)
 * - `examples/<key>.md` — the generated few-shot store, keyed by snippet selection
 *
 * (`pipelines/` holds authored multi-step pipelines — not read here yet.) Files are read fresh on
 * each call, so edits show up live in the inspector with no rebuild.
 */
const PACKAGE_DIR = join(import.meta.dirname, '..')
const PROMPTS_DIR = join(PACKAGE_DIR, 'prompts')
const SNIPPETS_DIR = join(PACKAGE_DIR, 'snippets')
const EXAMPLES_DIR = join(PACKAGE_DIR, 'examples')

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

/** A template loaded from disk: its prompt body (frontmatter stripped) and any declared output schema. */
export interface LoadedTemplate {
  readonly body: string
  /** The output schema name (`schemas/<out>.json`) this template's call validates against; absent → prose. */
  readonly out?: string
}

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/

/** Read a template, splitting optional YAML frontmatter (e.g. `out:`) from the prompt body. */
export const loadTemplate = (name: string): LoadedTemplate => {
  const raw = readFileSync(join(PROMPTS_DIR, `${name}.md`), 'utf8')
  const match = FRONTMATTER.exec(raw)
  if (!match) {
    return { body: raw.trimEnd() }
  }
  const front: unknown = parse(match[1])
  let out: string | undefined
  if (front !== null && typeof front === 'object' && 'out' in front) {
    const value = (front as Record<string, unknown>).out
    if (typeof value === 'string') {
      out = value
    }
  }
  return { body: raw.slice(match[0].length).trimEnd(), out }
}

/** Read the snippet that fills `{{placeholder}}`, by convention from `snippets/<placeholder>/<name>.md`. */
const readSnippet = (placeholder: string, name: string): string => {
  const dir = placeholder.replace(/_/g, '-')
  const path = join(SNIPPETS_DIR, dir, `${name}.md`)
  try {
    return readFileSync(path, 'utf8').trimEnd()
  } catch {
    throw new Error(`chronicler: no snippet "${name}" for {{${placeholder}}} (looked for snippets/${dir}/${name}.md)`)
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
  const template = loadTemplate(spec.template).body
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
 * a failed trial), `prize` (a gain, only on a won trial), and `discovery` (an unsought goal the trial
 * turned up). Keeping them on the trial gives the model the join the flat ledger could not: it knows
 * *which* beat won the relic or cost the standing.
 */
interface TrialView {
  readonly approach: Approach
  readonly outcome: Outcome
  readonly lead?: LeadView
  readonly cost?: ResourceDelta
  readonly stake?: ResourceDelta
  readonly prize?: ResourceDelta
  readonly discovery?: ResourceDelta
}

/** A secondary aim as the chronicler sees it: its reward and whether the party achieved it. */
interface OptionalGoalView {
  readonly reward: ResourceDelta
  readonly won: boolean
}

/** A party member as the chronicler sees them: their name and the permanent record's stable texture. */
interface SeekerView {
  readonly name: string
  readonly appearance?: string
  readonly temperament?: string
}

/**
 * Who led a trial, and how they met it: the lead's name plus their affinity and competence *for that
 * trial's approach*, rendered as words. Affinity says whether they were keen to lead it or pressed
 * into it; competence whether it came off deftly or white-knuckle — neither bears on the outcome.
 */
interface LeadView {
  readonly name: string
  readonly affinity: string
  readonly competence: string
}

/** An adventure as the chronicler is allowed to see it. @see chronicleView */
interface AdventureView {
  readonly goal: Goal
  readonly party: readonly SeekerView[]
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
/** Render a seeker scale's signed level as its chronicle-legal word (the genome's numbers stay hidden). */
const affinityWord = (rating: number): string => AFFINITY_WORDS[rating - RATING_MIN]
const competenceWord = (rating: number): string => COMPETENCE_WORDS[rating - RATING_MIN]

/** Project a seeker to the cast view: name plus whatever permanent-record texture they carry. */
const projectSeeker = (seeker: Seeker): SeekerView => ({
  name: seeker.name,
  ...(seeker.appearance ? { appearance: seeker.appearance } : {}),
  ...(seeker.temperament ? { temperament: seeker.temperament } : {}),
})

export const chronicleView = (adventure: Adventure): AdventureView => {
  const discovered = new Map(adventure.unknownGoals.map((u) => [u.trial, u.reward]))
  const byId = new Map(adventure.party.map((seeker) => [seeker.id, seeker]))
  return {
    goal: adventure.goal,
    party: adventure.party.map(projectSeeker),
    optionalGoals: adventure.optionalGoals.map((opt) => ({
      reward: opt.reward,
      won: adventure.trials[opt.trial].outcome === 'success',
    })),
    trials: adventure.trials.map((trial, i) => {
      const discovery = discovered.get(i)
      const seeker = byId.get(trial.lead)
      const lead =
        seeker ?
          {
            name: seeker.name,
            affinity: affinityWord(skillFor(seeker, trial.approach).affinity),
            competence: competenceWord(skillFor(seeker, trial.approach).competence),
          }
        : undefined
      return {
        approach: trial.approach,
        outcome: trial.outcome,
        ...(lead ? { lead } : {}),
        ...(trial.cost ? { cost: trial.cost } : {}),
        ...(trial.stake && trial.outcome === 'failure' ? { stake: trial.stake } : {}),
        ...(trial.prize && trial.outcome === 'success' ? { prize: trial.prize } : {}),
        ...(discovery ? { discovery } : {}),
      }
    }),
    outcome: adventure.outcome,
  }
}

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
 * Load up to `count` few-shot examples for a snippet selection, from `examples/<key>.md`
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
    text = readFileSync(join(EXAMPLES_DIR, `${examplesKey(snippets)}.md`), 'utf8')
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

/**
 * The default composition for the per-trial ("zoom-in") chronicle: the same voice axes as the whole
 * chronicle, but the `single-trial` template, which narrates one beat at a time given the aim, the
 * story so far, and that trial's mechanics. No examples — the few-shot store is whole-adventure.
 */
export const SINGLE_TRIAL_DEFAULTS = {
  template: 'single-trial',
  snippets: { register: 'legendary', writing_style: 'mythic', invention: 'descriptive' },
} as const

/**
 * Build the prompt that narrates a *single* trial of an adventure, continuing a running narrative.
 *
 * The hypothesis this serves: narrating one beat at a time — handing the model the expedition's aim,
 * the prose of the story so far, and just this trial's mechanics — yields richer, more specific
 * detail than asking for a whole adventure at once (which tends toward summary). The caller chains
 * these (see {@link chronicleByTrial}), feeding each trial's narrative back as `adventureSoFar` for
 * the next. The aim and the single trial are projected through the same chronicle-legal view as the
 * whole chronicle (no dice); only the trial at `trialIndex` is shown, plus the goals as context.
 */
export const buildSingleTrialPrompt = (
  adventure: Adventure,
  trialIndex: number,
  adventureSoFar: string,
  overrides?: { readonly template?: string; readonly snippets?: Readonly<Record<string, string>> },
): string => {
  const view = chronicleView(adventure)
  if (trialIndex < 0 || trialIndex >= view.trials.length) {
    throw new Error(`single-trial: no trial at index ${trialIndex} (adventure has ${view.trials.length})`)
  }
  const aims = { goal: view.goal, optionalGoals: view.optionalGoals }
  const soFar = adventureSoFar.trim()
  return buildPrompt({
    template: overrides?.template ?? SINGLE_TRIAL_DEFAULTS.template,
    snippets: { ...SINGLE_TRIAL_DEFAULTS.snippets, ...overrides?.snippets },
    data: {
      aims: JSON.stringify(aims, null, 2),
      party: JSON.stringify(view.party, null, 2),
      adventure_so_far: soFar.length > 0 ? soFar : '(Nothing yet — this is the first beat of the expedition.)',
      trial: JSON.stringify(view.trials[trialIndex], null, 2),
    },
  })
}

/** One trial's narrated beat: its index, the prompt that produced it, and the narrative itself. */
export interface TrialChronicle {
  readonly index: number
  readonly prompt: string
  readonly narrative: string
}

/**
 * Narrate an adventure beat by beat: for each trial in order, build a {@link buildSingleTrialPrompt}
 * whose "story so far" is everything narrated up to that point, and append the result. Returns each
 * beat (with its prompt, for inspection); the full chronicle is the narratives joined in order. A
 * summary pass over the whole is a separate, later step.
 */
export const chronicleByTrial = async (
  adventure: Adventure,
  llm: Llm,
  overrides?: { readonly template?: string; readonly snippets?: Readonly<Record<string, string>> },
  options?: LlmOptions,
): Promise<TrialChronicle[]> => {
  const beats: TrialChronicle[] = []
  let soFar = ''
  for (let index = 0; index < adventure.trials.length; index += 1) {
    const prompt = buildSingleTrialPrompt(adventure, index, soFar, overrides)
    const narrative = (await llm(prompt, options)).trim()
    beats.push({ index, prompt, narrative })
    soFar = soFar.length > 0 ? `${soFar}\n\n${narrative}` : narrative
  }
  return beats
}

/**
 * The default composition for the summary pass: only the voice axes apply. `invention` (latitude to
 * invent) is deliberately absent — a summary distils what the draft already says, the opposite of
 * inventing — so the `summary` template carries no `{{invention}}` placeholder.
 */
export const SUMMARY_DEFAULTS = {
  template: 'summary',
  snippets: { register: 'legendary', writing_style: 'mythic' },
} as const

/**
 * Build the prompt that distils a beat-by-beat draft into a single finished chronicle. The draft
 * (`fullNarrative`, the {@link chronicleByTrial} beats joined) is the model's only source of truth —
 * it condenses and shapes, inventing nothing. Takes the same voice (`register`/`writing_style`) as
 * the draft; any `invention` in `overrides.snippets` is ignored, since the summary template has no
 * slot for it.
 */
export const buildSummaryPrompt = (
  adventure: Adventure,
  fullNarrative: string,
  overrides?: { readonly template?: string; readonly snippets?: Readonly<Record<string, string>> },
): string => {
  const view = chronicleView(adventure)
  const aims = { goal: view.goal, optionalGoals: view.optionalGoals }
  return buildPrompt({
    template: overrides?.template ?? SUMMARY_DEFAULTS.template,
    snippets: {
      register: overrides?.snippets?.register ?? SUMMARY_DEFAULTS.snippets.register,
      writing_style: overrides?.snippets?.writing_style ?? SUMMARY_DEFAULTS.snippets.writing_style,
    },
    data: { aims: JSON.stringify(aims, null, 2), full_chronicle: fullNarrative.trim() },
  })
}

/** The full zoom-in product: each per-trial beat, plus the summary pass that distils them. */
export interface ZoomedChronicle {
  readonly beats: readonly TrialChronicle[]
  /** The prompt the summary pass was given (the beats joined as a draft). */
  readonly summaryPrompt: string
  /** The finished chronicle — the distilled summary of the beats. */
  readonly summary: string
}

/**
 * The full "zoom in, then summarise" pipeline: narrate the adventure beat by beat for rich, specific
 * detail (see {@link chronicleByTrial}), then distil those beats into a single readable chronicle
 * (see {@link buildSummaryPrompt}). Returns both, so a caller can show the finished chronicle and
 * still inspect the rich draft it came from.
 */
export const chronicleZoomed = async (
  adventure: Adventure,
  llm: Llm,
  overrides?: { readonly template?: string; readonly snippets?: Readonly<Record<string, string>> },
  options?: LlmOptions,
): Promise<ZoomedChronicle> => {
  const beats = await chronicleByTrial(adventure, llm, overrides, options)
  const draft = beats.map((beat) => beat.narrative).join('\n\n')
  const summaryPrompt = buildSummaryPrompt(adventure, draft, overrides)
  const summary = (await llm(summaryPrompt, options)).trim()
  return { beats, summaryPrompt, summary }
}

/** Which snippet axes a single template uses, its data placeholders, and whether it takes examples. */
export interface TemplateUse {
  /** The snippet-axis placeholders this template contains (a subset of {@link PromptOptions.axes}). */
  readonly axes: readonly string[]
  /** The non-axis placeholders — the data the template must be given (e.g. `aims`, `trials`, `examples`). */
  readonly data: readonly string[]
  /** Whether the template has an `{{examples}}` slot — i.e. the example-count lever applies. */
  readonly examples: boolean
}

/** The snippet axes (one per `snippets/<dir>/`) and templates available to compose a prompt. */
export interface PromptOptions {
  /** Template names under `prompts/`. */
  readonly templates: readonly string[]
  /** One entry per snippet directory: the placeholder it fills and the snippet names to choose from. */
  readonly axes: readonly { readonly placeholder: string; readonly options: readonly string[] }[]
  /** Per template (keyed by name): which axes it uses and whether it takes examples — for a UI to
   * show only the controls a given template actually has. */
  readonly templateUses: Readonly<Record<string, TemplateUse>>
}

/**
 * Discover the composable prompt pieces on disk, by convention: templates are the `.md` files in
 * `prompts/`, and every directory under `snippets/` is a snippet axis whose placeholder is its name
 * (`-` → `_`). Lets a UI build its controls from the filesystem, so dropping in a new snippet file
 * makes it selectable with no code change. `templateUses` reports, per template, which of those axes
 * it actually contains (by parsing its placeholders) so the UI can show only the relevant dropdowns.
 */
export const listPromptOptions = (): PromptOptions => {
  const mdNames = (dir: string): string[] =>
    readdirSync(dir)
      .filter((file) => file.endsWith('.md'))
      .map((file) => file.slice(0, -'.md'.length))
      .sort()
  const axes = readdirSync(SNIPPETS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ placeholder: entry.name.replace(/-/g, '_'), options: mdNames(join(SNIPPETS_DIR, entry.name)) }))
    .sort((a, b) => a.placeholder.localeCompare(b.placeholder))

  const templates = mdNames(PROMPTS_DIR)
  const axisNames = new Set(axes.map((axis) => axis.placeholder))
  const templateUses = Object.fromEntries(
    templates.map((name) => {
      const placeholders = placeholdersIn(loadTemplate(name).body)
      const used = [...axisNames].filter((axis) => placeholders.has(axis)).sort()
      const data = [...placeholders].filter((p) => !axisNames.has(p)).sort()
      return [name, { axes: used, data, examples: placeholders.has('examples') }]
    }),
  )
  return { templates, axes, templateUses }
}

/** Resolve an adventure into prose via the given {@link Llm}, forwarding any {@link LlmOptions}. */
export const chronicle = async (adventure: Adventure, llm: Llm, options?: LlmOptions): Promise<string> =>
  (await llm(buildChroniclePrompt(adventure), options)).trim()
