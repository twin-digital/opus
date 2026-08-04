/**
 * The vitest tooling: the one configuration entry that installs the library, and the escape hatch
 * for a test that needs the pack evaluated fresh.
 *
 * ```ts
 * // vitest.config.ts
 * import { minecraftTestLib } from '@twin-digital/minecraft-test-lib/vitest'
 *
 * export default { plugins: [minecraftTestLib()] }
 * ```
 *
 * This is the one entry that reaches `vi`. Nothing else the package ships depends on a test
 * framework, so the fakes behave identically under any runner.
 */

import { vi } from 'vitest'

import { createServer, type FakeServer } from '../create-server.js'
import { setupPath, shimPath, siblingStubs } from './paths.js'

/** The shape of the vite plugin the factory returns, as narrow as the runner needs it. */
export interface MinecraftTestLibPlugin {
  readonly name: string
  readonly config: () => {
    resolve: { alias: { find: RegExp; replacement: string }[] }
    test: { setupFiles: string[] }
  }
}

/**
 * The one entry a consumer adds to their runner's configuration. It contributes the alias that
 * makes a pack's `@minecraft/server` import resolve, the same for the `@minecraft/*` script
 * modules the fakes do not cover, and the setup module that installs a fresh server before each
 * test file evaluates. The consumer writes no setup file of their own.
 */
export const minecraftTestLib = (): MinecraftTestLibPlugin => ({
  name: '@twin-digital/minecraft-test-lib',
  config: () => ({
    resolve: {
      alias: [
        // Anchored: `@minecraft/server-ui` must not be caught by the `@minecraft/server` entry.
        { find: /^@minecraft\/server$/, replacement: shimPath() },
        ...Object.entries(siblingStubs()).map(([specifier, replacement]) => ({
          find: new RegExp(`^${specifier.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')}$`),
          replacement,
        })),
      ],
    },
    test: { setupFiles: [setupPath()] },
  }),
})

/** What `loadPack` may vary before the pack evaluates. */
export interface LoadPackOptions {
  /**
   * The server to install, where a test needs one that differs before the pack evaluates. Build it
   * inside the importer's own module generation — a bundle from a previous generation belongs to a
   * different copy of the library.
   */
  readonly server?: FakeServer
}

/**
 * Evaluates a pack against a server no previous test has touched, and hands back that server.
 *
 * The ordering is the point, and it is this function's to own: the module registry is reset, the
 * library is imported fresh, a new server is installed, and only then is the importer called — so
 * the pack's module-scope subscriptions and scheduled runs land on the returned server.
 *
 * This is the escape hatch, not the default path. Reach for it where a test needs a fresh
 * evaluation: pack module-scope state a test mutates, load-time behaviour itself, scheduled-run
 * accumulation, or a server that must differ before the pack evaluates. Otherwise use the static
 * imports the plugin's setup module already supports.
 *
 * @example
 * ```ts
 * const server = await loadPack(() => import('../src/main.js'))
 * advanceTicks(server, 20)
 * ```
 */
export const loadPack = async (importer: () => Promise<unknown>, options?: LoadPackOptions): Promise<FakeServer> => {
  vi.resetModules()
  const control = (await import('../index.js')) as {
    createServer: typeof createServer
    __useServer: (server?: FakeServer) => void
  }
  const server = options?.server ?? control.createServer()
  // Unsetting first is what makes the install unconditional: where the reset gave a fresh library
  // generation there is nothing installed, and where it did not, the previous file's live server
  // would otherwise refuse to be replaced.
  control.__useServer()
  control.__useServer(server)
  await importer()
  return server
}
