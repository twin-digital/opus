/**
 * Run vitest source-first.
 *
 * The monorepo resolves workspace packages through the `source` export condition, but a
 * vitest config file (and the `vitest.config.d/*.ts` fragments it imports) is loaded by
 * node, not by vite — so without help it resolves workspace imports to `dist`. Two module
 * instances of the same package follow, one in the config and one in the test files, and a
 * plugin installed by the config then acts on a copy the tests never see.
 *
 * Two node flags fix that:
 *
 * - `--conditions=source` adds the condition to node's resolver, so the config gets `src`.
 * - tsx's loader resolves the `.js` specifiers TypeScript source uses to the `.ts` files
 *   beside them, which node's type stripping does not do on its own.
 *
 * They go on vitest's own argv rather than in `NODE_OPTIONS` so they stay in this process.
 * Test files are transformed by vite, not by node, and a pool worker that inherited tsx
 * would resolve a dependency shipping both `index.ts` and `index.js` to the wrong one.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const tsxLoader = pathToFileURL(fileURLToPath(import.meta.resolve('tsx'))).href

/** Resolve the vitest CLI from the package being tested, not from this one. */
const vitestCli = () => {
  const require = createRequire(path.join(process.cwd(), 'package.json'))
  const manifest = require.resolve('vitest/package.json')
  return path.join(path.dirname(manifest), require('vitest/package.json').bin.vitest)
}

/** Spawn vitest with `args`, and exit this process with its status. */
export const runVitest = (args) => {
  const child = spawn(process.execPath, ['--conditions=source', '--import', tsxLoader, vitestCli(), ...args], {
    stdio: 'inherit',
  })
  child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)))
}
