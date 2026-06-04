import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import type { Llm } from './chronicle.js'

const run = promisify(execFile)

/**
 * An {@link Llm} backed by the local, already-authenticated `claude` CLI in headless print
 * mode (`claude -p`). Uses your Claude subscription — handy for dev with no AWS/Bedrock setup.
 * The prompt is passed as an argv element (not a shell string), so no escaping is needed.
 *
 * The CLI is run in a fresh empty temp dir under the OS temp root — outside the repo — so it
 * has no project files as context and won't walk up into the repo's CLAUDE.md. Otherwise the
 * surrounding code leaks into the generated prose (it once named the world "Farwatch").
 */
export const claudeCli: Llm = async (prompt) => {
  const dir = await mkdtemp(join(tmpdir(), 'farwatch-chronicler-'))
  try {
    const { stdout } = await run('claude', ['-p', prompt], {
      cwd: dir,
      maxBuffer: 8 * 1024 * 1024,
    })
    return stdout
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
