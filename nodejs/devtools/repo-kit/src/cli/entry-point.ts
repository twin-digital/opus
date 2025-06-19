import fs from 'node:fs'
import path from 'node:path'
import { Command } from 'commander'

const packageJson = JSON.parse(
  fs.readFileSync(
    path.join(import.meta.dirname, '..', '..', 'package.json'),
    'utf-8',
  ),
) as { version: string | undefined }

const program = new Command()

program
  .name('repo-kit')
  .version(packageJson.version ?? 'unknown')
  .command('greetz', 'says hello and other messages')

program.parse(process.argv)
