import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Adventure, Approach, Outcome } from '@thrashplay/fw-simulation'

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
 * Which prompt variant the chronicler uses. Both files live in `prompts/` for A/B comparison:
 * `chronicle.md` (tight — invents only texture, capped length) and `chronicle-loose.md` (loosened
 * — invents motive and the specifics of each approach, no length cap). Swap this one line to test.
 */
const PROMPT_FILE = 'chronicle-loose.md'

/**
 * The prompt template lives as plain Markdown so it can be edited without touching TypeScript.
 * It sits at the package root (a sibling of `src/`/`dist/`), so the same relative path resolves
 * whether this module runs from source (dev) or the built `dist/` — and the build never has to
 * copy it. The file is read fresh on each call, so edits show up live in the inspector with no
 * rebuild or restart.
 */
const TEMPLATE_PATH = join(import.meta.dirname, '..', 'prompts', PROMPT_FILE)

/** Load the raw chronicle prompt template (with its `{{adventure}}` placeholder). */
export const loadChronicleTemplate = (): string => readFileSync(TEMPLATE_PATH, 'utf8').trimEnd()

/** A trial as the chronicler is allowed to see it: its approach and outcome, no dice. */
interface TrialView {
  readonly approach: Approach
  readonly outcome: Outcome
}

/** An adventure as the chronicler is allowed to see it. @see chronicleView */
interface AdventureView {
  readonly trials: readonly TrialView[]
  readonly outcome: Outcome
}

/**
 * Project an adventure to the chronicle-legal view: the same graph shape with the resolver's
 * mechanical numbers (`roll`, `target`) dropped. The chronicle stays clean of numbers — *expose
 * the dice, hide the genome* — and the surest way to keep dice out of the prose is to never hand
 * them to the model. Today the approach and outcome of each trial, in order, survive; everything
 * chronicle-legal that the genome later grows (obstacle, prize, seekers, a defied edict's
 * *because*) joins this view, and the template's schema section grows with it.
 */
const chronicleView = (adventure: Adventure): AdventureView => ({
  trials: adventure.trials.map((trial) => ({ approach: trial.approach, outcome: trial.outcome })),
  outcome: adventure.outcome,
})

/** Serialize the chronicle-legal view as the JSON the template drops into `<adventure>`. */
const renderAdventure = (adventure: Adventure): string => JSON.stringify(chronicleView(adventure), null, 2)

/** Substitute `{{key}}` placeholders, leaving any unknown ones intact so typos are visible. */
const fill = (template: string, vars: Record<string, string>): string =>
  template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? `{{${key}}}`)

/**
 * Build the chronicler's prompt from a resolved adventure and the template.
 *
 * The only established fact handed to the model is the chronicle-legal view of the adventure
 * (see {@link chronicleView}); whatever it must invent beyond that is exactly the gap we read the
 * output to measure. The voice and the but/therefore grammar live in the template prose, not here.
 * Pass `template` explicitly to test or to preview an override; it defaults to the file.
 */
export const buildPrompt = (adventure: Adventure, template: string = loadChronicleTemplate()): string =>
  fill(template, { adventure: renderAdventure(adventure) })

/** Resolve an adventure into prose via the given {@link Llm}, forwarding any {@link LlmOptions}. */
export const chronicle = async (adventure: Adventure, llm: Llm, options?: LlmOptions): Promise<string> =>
  (await llm(buildPrompt(adventure), options)).trim()
