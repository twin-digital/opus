import { spawnSync } from 'node:child_process'

const args = ['run', '--passWithNoTests', ...process.argv.slice(2)]
const result = spawnSync('vitest', args, { stdio: 'inherit', shell: true })
process.exit(result.status ?? 1)
