#!/usr/bin/env node

import { Command } from 'commander'
import { execTf } from '../tf/exec-tf.js'
import { getPackageVersion } from './get-package-version.cjs'

const program = new Command()
  .name('tdtf')
  .version(getPackageVersion() ?? 'unknown')
  .argument('[tfArgs...]')
  .action(async (tfArgs) => {
    const resultOrError = await execTf(tfArgs)

    if (resultOrError.failed) {
      console.error(
        `Failed to invoke tf command. See above output for details.`,
      )
      process.exit(resultOrError.exitCode ?? 1)
    }
  })

const main = async () => {
  await program.parseAsync(process.argv)
}

main().catch((err: unknown) => {
  console.error(err)
  console.error(
    '--------------------------------------------------------------------------------------------------------------',
  )
  console.error(
    `Command failed: ${err instanceof Error ? err.message : String(err)}`,
  )
  console.error('See previous output for more details.')
  process.exit(1)
})
