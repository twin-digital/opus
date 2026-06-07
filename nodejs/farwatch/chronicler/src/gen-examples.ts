import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Adventure } from '@thrashplay/fw-simulation'
import { makeAdventure, makeTrial } from '@thrashplay/fw-simulation/testing'

import { buildPrompt, examplesKey, listPromptOptions, renderAdventure } from './chronicle.js'
import { claudeCli } from './claude-cli.js'

/**
 * Regenerate the few-shot example store under `examples/`.
 *
 * Examples are tied to a snippet selection so the chronicler's few-shots always match the voice
 * being asked for. This script enumerates every combination of the snippet axes (discovered from
 * disk via {@link listPromptOptions}, so it extends automatically as snippets/axes are added),
 * narrates a fixed set of seed adventures in each combination via `claude -p`, and writes one
 * `<key>.md` per combo (see {@link examplesKey}). Generation is zero-shot — the strong generator
 * model produces exemplars that the cheaper runtime model then imitates.
 *
 * Usage: `pnpm --filter @thrashplay/fw-chronicler gen-examples [--force] [--dry-run] [--model=NAME]`
 * - `--force`    regenerate combos that already have a file (default: skip them, preserving any
 *                hand-authored examples)
 * - `--dry-run`  list what would be generated, calling no model
 * - `--model`    generator model passed to `claude -p` (default: `sonnet`)
 */

const EXAMPLES_DIR = join(import.meta.dirname, '..', 'examples')

const trial = makeTrial

/**
 * The seed adventures every combo narrates — the same inputs across all voices, so the only thing
 * that differs between files is the prose. Add a seed to widen the example pool (and the count
 * lever's ceiling). Kept varied in shape: a failed delve, an all-won negotiation, a recovery.
 */
const SEEDS: readonly Adventure[] = [
  makeAdventure({
    trials: [
      trial({ approach: 'stealth', outcome: 'success' }),
      trial({ approach: 'combat', outcome: 'success' }),
      trial({ approach: 'lore', outcome: 'failure' }),
      trial({ approach: 'might', outcome: 'failure' }),
    ],
    outcome: 'failure',
  }),
  makeAdventure({
    trials: [
      trial({ approach: 'diplomacy', outcome: 'success' }),
      trial({ approach: 'wealth', outcome: 'success' }),
      trial({ approach: 'resolve', outcome: 'success' }),
    ],
    outcome: 'success',
  }),
  makeAdventure({
    trials: [trial({ approach: 'evasion', outcome: 'failure' }), trial({ approach: 'sacrifice', outcome: 'success' })],
    outcome: 'success',
  }),
]

/** Every combination of the snippet axes, as `{ placeholder: option }` selections. */
const cartesian = (
  axes: readonly { readonly placeholder: string; readonly options: readonly string[] }[],
): Record<string, string>[] =>
  axes.reduce<Record<string, string>[]>(
    (selections, axis) =>
      selections.flatMap((selection) => axis.options.map((option) => ({ ...selection, [axis.placeholder]: option }))),
    [{}],
  )

/** Run `fn` over `items` with at most `limit` in flight at once. */
const runPool = async <T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> => {
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      await fn(items[next++])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

const log = (message: string): void => void process.stderr.write(`${message}\n`)

const args = process.argv.slice(2)
const force = args.includes('--force')
const dryRun = args.includes('--dry-run')
const model = args.find((arg) => arg.startsWith('--model='))?.slice('--model='.length) ?? 'sonnet'

const combos = cartesian(listPromptOptions().axes)
mkdirSync(EXAMPLES_DIR, { recursive: true })
log(
  `${combos.length} combos × ${SEEDS.length} seeds = ${combos.length * SEEDS.length} examples · model=${model}${dryRun ? ' · dry-run' : ''}`,
)

let written = 0
await runPool(combos, dryRun ? combos.length : 4, async (combo) => {
  const key = examplesKey(combo)
  const file = join(EXAMPLES_DIR, `${key}.md`)
  if (existsSync(file) && !force) {
    log(`skip   ${key} (exists)`)
    return
  }
  if (dryRun) {
    log(`would  ${key}`)
    return
  }
  const blocks: string[] = []
  for (const seed of SEEDS) {
    const adventure = renderAdventure(seed)
    const prompt = buildPrompt({ template: 'chronicle', snippets: combo, data: { adventure, examples: '' } })
    const prose = (await claudeCli(prompt, { model })).trim()
    blocks.push(`<example>\n<adventure>\n${adventure}\n</adventure>\n<chronicle>\n${prose}\n</chronicle>\n</example>`)
  }
  writeFileSync(file, `${blocks.join('\n\n')}\n`)
  written += 1
  log(`wrote  ${key} (${written})`)
})
log('done')
