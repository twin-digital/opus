import { spawnSync } from 'node:child_process'

const result = spawnSync('tsc', ['--noEmit'], {
  stdio: 'inherit',
  shell: true,
})
process.exit(result.status ?? 1)
