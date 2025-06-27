import type { Configuration } from '../repo-kit-configuration.js'
import type { PackageMeta } from '../workspace/package-meta.js'
import { makeJsonMergePatchAction } from './actions/json-merge-patch.js'
import { makeJsonPatchAction } from './actions/json-patch.js'
import { makeWriteFileAction } from './actions/write-file.js'
import { makeExistsCondition } from './conditions/exists-condition.js'
import { makeNotExistsCondition } from './conditions/not-exists-condition.js'
import type { SyncResult } from './sync-result.js'
import type { SyncRule } from './sync-rule.js'
import type {
  SyncRuleConfigEntry,
  SyncRulesAction,
  SyncRulesCondition,
  SyncRulesConfig,
} from './sync-rules-config.js'

/**
 * Predicate (condition) used to determine if a particular rule applies to a given package.
 */
export type SyncRuleConditionFn = (
  workspace: PackageMeta,
) => boolean | Promise<boolean>

/**
 * Action which is taken by a rule to modify the contents of a package.
 */
export type SyncRuleActionFn = (
  workspace: PackageMeta,
) => SyncResult | Promise<SyncResult>

const makeConditionFn = (condition: SyncRulesCondition) => {
  if ('exists' in condition) {
    return makeExistsCondition(condition.exists)
  } else if ('notExists' in condition) {
    return makeNotExistsCondition(condition.notExists)
  }
  throw new Error('Unknown condition type')
}

const makeActionFn = (action: SyncRulesAction) => {
  switch (action.action) {
    case 'json-merge-patch':
      return makeJsonMergePatchAction(action.file, action.options)
    case 'json-patch':
      return makeJsonPatchAction(action.file, action.options)
    case 'write-file':
      return makeWriteFileAction(action.file, action.options)
  }
}

const doApplyActions = async (
  workspace: PackageMeta,
  actions: SyncRuleActionFn[] = [],
): Promise<SyncResult> => {
  const changedFiles: Set<string> = new Set<string>()
  for (const action of actions) {
    const result = await action(workspace)
    if (result.result === 'error') {
      return result
    } else if (result.result === 'ok') {
      result.changedFiles.forEach((file) => {
        changedFiles.add(file)
      })
    }
  }

  return changedFiles.size === 0 ?
      { result: 'skipped' }
    : {
        changedFiles: [...changedFiles],
        result: 'ok',
      }
}

/**
 * Create a sync rule to apply to a project.
 * @param config The `SyncRulesConfigEntry` defining the conditions and actions for the rule
 * @param userConfig User-supplied configuration to customize rule behavior.
 * @returns The `SyncRule` corresponding to the supplied configuration.
 */
const makeSyncRule = (
  config: SyncRuleConfigEntry,
  _userConfig: Configuration,
): SyncRule => {
  const conditions = config.conditions?.map((condition) =>
    makeConditionFn(condition),
  )
  const applyActions = config.applyActions.map((action) => makeActionFn(action))
  const unapplyActions = config.unapplyActions?.map((action) =>
    makeActionFn(action),
  )

  const isApplicable = async (workspace: PackageMeta): Promise<boolean> => {
    if (conditions !== undefined && conditions.length > 0) {
      for (const condition of conditions) {
        const result = await condition(workspace)
        if (result) {
          return true
        }
      }

      return false
    } else {
      // no conditions == always apply this rule
      return true
    }
  }

  return {
    apply: async (workspace: PackageMeta) => {
      const applicable = await isApplicable(workspace)

      return applicable ?
          doApplyActions(workspace, applyActions)
        : doApplyActions(workspace, unapplyActions)
    },
    name: config.name,
  }
}

/**
 * Create the sync rules to apply to a project.
 * @param config The `SyncRulesConfig` defining the conditions and actions for each rule.
 * @param userConfig User-supplied configuration to customize rule behavior.
 * @returns Set of `SyncRules` applicable to the supplied configuration.
 */
export const makeSyncRules = ({
  config,
  rules,
}: {
  /**
   * User-supplied repo-kit configuration used to customize how rules are applied.
   */
  config: Configuration

  /**
   * The `SyncRules` config defining the available rules.
   */
  rules: SyncRulesConfig
}): SyncRule[] => rules.syncRules.map((rule) => makeSyncRule(rule, config))
