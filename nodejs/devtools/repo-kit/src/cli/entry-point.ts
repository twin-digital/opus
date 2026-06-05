#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { Command } from 'commander'
import { makeCommand as makeSyncCommand } from './commands/sync.js'
import { makeCommand as makeUpdateReadmeCommand } from './commands/update-readme.js'

// Explicit registry of command factories. Static imports (rather than a runtime directory scan) keep behavior
// identical whether the CLI runs from compiled `dist` or directly from TypeScript source — a filesystem scan that
// filtered on file extension diverged between the two. Add new commands here.
const commandFactories = [makeSyncCommand, makeUpdateReadmeCommand]

const registerCommands = (program: Command) => {
  for (const makeCommand of commandFactories) {
    program.addCommand(makeCommand())
  }
}

const main = async () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'package.json'), 'utf-8'),
  ) as { version: string | undefined }

  const program = new Command().name('repo-kit').version(packageJson.version ?? 'unknown')

  registerCommands(program)
  await program.parseAsync(process.argv)
}

// disable warnings for experimental features we are knowingly using
const originalWarningListeners = process.listeners('warning').slice()
process.removeAllListeners('warning')
process.on('warning', (warning) => {
  // suppress warnings for experimental 'glob' feature we are using, iff:
  //   - name is ExperimentalWarning
  //   - message mentions the glob API
  if (warning.name === 'ExperimentalWarning' && warning.message.includes('glob')) {
    return
  }

  // otherwise, re-emit by handing off to the original handlers (preserving Node’s default output)
  for (const listener of originalWarningListeners) {
    try {
      listener.call(process, warning)
    } catch {
      // if they fail, ignore
    }
  }
})

main().catch((err: unknown) => {
  console.error(err)
  console.error(
    '--------------------------------------------------------------------------------------------------------------',
  )
  console.error(`Command failed: ${err instanceof Error ? err.message : String(err)}`)
  console.error('See previous output for more details.')
  process.exit(1)
})
