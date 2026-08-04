/**
 * Where the plugin points a runner's resolver. The aliased surface and the sibling stubs are files
 * inside this package, not published subpaths, so they are reached by resolved path — which the
 * package finds relative to itself, and which is a `.ts` when the package is consumed from source
 * and a `.js` once it is built.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

/** Resolves one of this package's own modules to an absolute path a resolver can be pointed at. */
const own = (relative: string): string => {
  for (const extension of ['.js', '.ts']) {
    const candidate = path.resolve(here, `${relative}${extension}`)
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  throw new Error(`@twin-digital/minecraft-test-lib is missing ${relative}; the package build is incomplete`)
}

/** The aliased `@minecraft/server` surface. */
export const shimPath = (): string => own('../shim/index')

/** The setup module that installs a default server before each test file evaluates. */
export const setupPath = (): string => own('./setup')

/** The stubs the package ships for `@minecraft/*` script modules the fakes do not cover. */
export const siblingStubs = (): Readonly<Record<string, string>> => ({
  '@minecraft/server-ui': own('../generated/shim/server-ui'),
})
