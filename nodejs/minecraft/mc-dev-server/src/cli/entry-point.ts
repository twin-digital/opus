import { readFileSync } from 'node:fs'

import { destroy } from '../commands/destroy.js'
import { start } from '../start/start.js'
import { stop } from '../commands/stop.js'
import { stdoutStream } from '../stream.js'
import { buildProgram } from './program.js'

const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  version: string
}

const program = buildProgram({
  version: manifest.version,
  stream: stdoutStream,
  handlers: { start, stop, destroy },
  cwd: () => process.cwd(),
  interactive: () => process.stdin.isTTY,
})

try {
  await program.parseAsync(process.argv)
} catch (error) {
  stdoutStream.write('deploy', (error as Error).message)
  process.exitCode = 1
}
