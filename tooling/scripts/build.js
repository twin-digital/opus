import { spawnSync } from 'node:child_process'

const args = [
  'src/index.ts',
  '--format',
  'esm',
  '--dts',
  ...process.argv.slice(2),
]

const result = spawnSync('tsup', args, {
  stdio: 'inherit',
  shell: true,
})

process.exit(result.status ?? 1)
