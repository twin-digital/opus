import { spawnSync } from 'node:child_process'

const args = ['src', '--ext', '.ts,.tsx', ...process.argv.slice(2)]

const result = spawnSync('eslint', args, {
  stdio: 'inherit',
  shell: true,
})

process.exit(result.status ?? 1)
