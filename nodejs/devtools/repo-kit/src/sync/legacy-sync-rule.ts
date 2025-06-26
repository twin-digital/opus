import type { PackageMeta } from '../workspace/package-meta.js'
import type { SyncResult } from './sync-result.js'
import type { SyncOptions } from './sync-rule.js'

/**
 * A `SyncRule` represents one or more changes to a monorepo package that are applied conditionally to each workspace.
 * The rule includes a predicate to determine if it applies to a package (for example, a `typecheck` task might only
 * be created if a project has a tsconfig file), a function to apply the relevant changes, and a function to undo the
 * changes if they are no longer applicable.
 */
export interface LegacySyncRule {
  /**
   * Applies the changes associated with this rule to an applicable workspace. Typically, changes including adding,
   * removing, or updating files in the workspace.
   *
   * @param workspace Metadata for the package to which changes will apply.
   * @param options Options to use when applying the changes
   */
  apply(
    workspace: PackageMeta,
    options: SyncOptions,
  ): SyncResult | Promise<SyncResult>

  /**
   * Determines if this rules applies to a package.
   *
   * @param workspace Metadata for the package to evaluate
   * @param options Options to use when evaluating the package
   */
  isApplicableTo(
    workspace: PackageMeta,
    options: SyncOptions,
  ): boolean | Promise<boolean>

  /**
   * Undoes the changes from this rule to a workspace to which the rule no longer applies. Should make the inverse
   * of the changed performed by `apply`.
   *
   * @param workspace Metadata for the package to which changes will apply.
   * @param options Options to use when applying the changes
   */
  unapply(
    workspace: PackageMeta,
    options: SyncOptions,
  ): SyncResult | Promise<SyncResult>
}

export type SyncRuleConditionFn = (
  workspace: PackageMeta,
  options: SyncOptions,
) => boolean | Promise<boolean>

export type SyncRuleActionFn = (
  workspace: PackageMeta,
  options: SyncOptions,
) => SyncResult | Promise<SyncResult>
