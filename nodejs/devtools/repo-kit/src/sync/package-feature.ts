import type { PackageMeta } from '../workspace/package-meta.js'
import type { SyncResult } from './sync-result.js'

/**
 * A `PackageFeature` represents a set of functionality which can be enabled, disabled, and configured in a package.
 */
export interface PackageFeature {
  /**
   * Configures a package for this feature, syncing it with any user-provided config and the pre-existing project
   * state. Typically, changes include adding removing, or updating files in the workspace.
   *
   * @param workspace Metadata for the package to which the rule will be applied.
   */
  configure(workspace: PackageMeta): SyncResult | Promise<SyncResult>

  /**
   * Human-readable name for this feature.
   */
  name: string
}
