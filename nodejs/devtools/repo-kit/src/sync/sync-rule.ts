import type { PackageMeta } from '../workspace/package-meta.js'
import type { SyncResult } from './sync-result.js'

/**
 * A `SyncRule` represents one or more changes to a monorepo package that are applied each workspace.
 */
export interface SyncRule {
  /**
   * Applies the changes associated with this rule to an applicable workspace. Typically, changes including adding,
   * removing, or updating files in the workspace.
   *
   * @param workspace Metadata for the package to which the rule will be applied.
   */
  apply(workspace: PackageMeta): SyncResult | Promise<SyncResult>

  /**
   * Human-readable name for this rule.
   */
  name: string
}
