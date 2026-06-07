import { parseArgs } from 'node:util'

import { generateFounding } from './generate.js'
import { renderFounding } from './render.js'

/**
 * Generate and print one or more compact foundings. Run via the package's `gen` script:
 *
 *   pnpm --filter @thrashplay/fw-worldgen gen --seed 7              one founding from seed 7
 *   pnpm --filter @thrashplay/fw-worldgen gen --seed 7 --count 5    five foundings, seeds 7..11
 *   pnpm --filter @thrashplay/fw-worldgen gen                       one founding from a random seed (printed, so it's reproducible)
 */
const { values } = parseArgs({
  options: {
    seed: { type: 'string' },
    count: { type: 'string', default: '1' },
  },
})

const baseSeed = values.seed !== undefined ? Number(values.seed) : Math.floor(Math.random() * 2 ** 31)
const count = Math.max(1, Number(values.count) || 1)

const foundings: string[] = []
for (let i = 0; i < count; i++) {
  foundings.push(renderFounding(generateFounding(baseSeed + i)))
}
console.log(foundings.join('\n\n'))
