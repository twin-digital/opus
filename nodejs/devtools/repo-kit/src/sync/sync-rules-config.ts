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

/**
 * A `SyncRules` condition which matches if a specific file pattern does NOT exist in the package
 */
export interface SyncRulesNotExistsCondition {
  /**
   * File glob used to look for files within a package. This glob is interpreted relative to the base directory of the
   * package. If no files match the glob, the condition is satisfied and `applyActions` will be applied.
   */
  notExists: string
}

export type SyncRulesCondition = SyncRulesExistsCondition | SyncRulesNotExistsCondition

export type SyncRulesAction =
  | {
      action: 'json-patch'
      file: string
      options: {
        /**
         * A string containing the JSON Patch content in Yaml format.
         *
         * @example
         * ```
         * patch: |
         *   title: Hello!
         *   phoneNumber: '+01-123-456-7890'
         *   author:
         *     familyName: null
         *   tags: ["example"]
         * ```
         */
        patch: string
      }
    }
  | {
      action: 'json-merge-patch'
      file: string
      options: {
        /**
         * A string containing the JSON Merge Patch content in Yaml format.
         *
         * @example
         * ```
         * patch: |
         *   - op: add
         *     path: /files/-
         *     value: dist
         *   - opx: add
         *     path: /files/-
         *     value: public
         * ```
         */
        patch: string
      }
    }
  | {
      action: 'write-file'
      file: string
      options: {
        /**
         * Content to write to the specified file.
         */
        content: string
      }
    }

/**
 * A single item in the sync-rules.yaml config.
 */
export interface SyncRuleConfigEntry {
  /**
   * Conditions used to determine if a rule applies to a package. If there are no conditions, the rule is always
   * applied. If there is at least one condition, the rule will apply if _any_ of the conditions is satisfied.
   * Otherwise, it will be `unapplied`.
   */
  conditions?: SyncRulesCondition[]

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
