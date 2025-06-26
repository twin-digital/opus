import type { ProjectManifest } from '@pnpm/types'
import type { SyncResult } from './sync-result.js'

export interface LegacySyncPlugin {
  /**
   * Name of the plugin
   */
  name: string

  /**
   * Applies the configuration from this plugin to a package in the monorepo.
   * @param params
   */
  sync(input: {
    /**
     * Manifest of the project to configure
     */
    manifest: ProjectManifest

    /**
     * Name of the package to configure
     */
    name: string

    /**
     * Path to the root of the package to configure
     */
    packagePath: string
  }): SyncResult | Promise<SyncResult>
}

export type SyncInput = Parameters<LegacySyncPlugin['sync']>[0]
