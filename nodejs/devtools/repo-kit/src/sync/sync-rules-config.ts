import { loadYamlAsset } from '../assets.js'

/**
 * A `SyncRules` condition which matches if a specific file pattern exist in the package
 */
export interface SyncRulesExistsCondition {
  /**
   * File glob used to look for files within a package. This glob is interpreted relative to the base directory of the
   * package. If any files match the glob, the condition is satisfied and `applyActions` will be applied.
   */
  exists: string
}

export type SyncRulesCondition = SyncRulesExistsCondition

export interface SyncRulesAction<
  O extends object | undefined = object | undefined,
> {
  /**
   * Name of the action.
   */
  action: string

  /**
   * Name of the file which the action will modify
   */
  file: string

  /**
   * Action-specific options
   */
  options: O
}

/**
 * A single item in the sync-rules.yaml config.
 */
export interface SyncRuleConfigEntry {
  /**
   * Conditions used to determine if a rule applies to a package. If _any_ of these conditions is satisfied, the rule
   * will be applied. (Otherwise, it will be `unapplied`.)
   */
  conditions: SyncRulesCondition[]

  /**
   * Set of actions take to sync a package if this rule applies.
   */
  applyActions: SyncRulesAction[]

  /**
   * Name of this rule
   */
  name: string

  /**
   * Set of actions take to sync a package if this rule does not apply. Generally used to undo the `applyActions`.
   */
  unapplyActions?: SyncRulesAction[]
}

export interface SyncRulesConfig {
  /**
   * List of SyncRules which have been configured.
   */
  syncRules: SyncRuleConfigEntry[]
}

export const loadSyncRulesConfig = (assetName = 'sync-rules.yaml') =>
  loadYamlAsset<SyncRulesConfig>(assetName)
