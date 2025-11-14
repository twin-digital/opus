import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

const projectRoot = resolve(process.cwd())
const globs = ['**/dist', '**/.turbo', '**/tsconfig.tsbuildinfo']

// Clean each pattern using `git clean -fdX`-like behavior, but safer
globs.forEach((pattern) => {
  try {
    execSync(
      `find ${projectRoot} -type d -name node_modules -prune -o -name "${pattern.split('/').pop()}" -print | xargs rm -rf`,
      {
        stdio: 'inherit',
      },
    )
  } catch (_err) {
    console.error(`Failed to clean pattern: ${pattern}`)
  }
})

console.log(
  '\n🧼 Cleaned all dist/, .turbo/, and tsconfig.tsbuildinfo files.\n',
)
