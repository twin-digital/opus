import { createInterface } from 'node:readline/promises'

import type { OutputStream } from '../stream.js'

/** Asks the author a yes/no question. Anything but an explicit yes is a no. */
export const confirmOnStdin = async (question: string, stream: OutputStream): Promise<boolean> => {
  stream.write('deploy', `${question} [y/N]`)
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false })
  try {
    const answer = await rl.question('')
    return /^y(es)?$/i.test(answer.trim())
  } finally {
    rl.close()
  }
}
