import type { Configuration } from '../repo-kit-configuration.js'
import type { PackageMeta } from '../workspace/package-meta.js'
import { makeJsonMergePatchAction } from './actions/json-merge-patch.js'
import { makeJsonPatchAction } from './actions/json-patch.js'
import { makeWriteFileAction } from './actions/write-file.js'
import { makeExistsCondition } from './conditions/exists-condition.js'
import { makeNotExistsCondition } from './conditions/not-exists-condition.js'
import type { PackageFeature } from './package-feature.js'
import type { SyncResult } from './sync-result.js'
import type {
  PackageFeatureConfig,
  PackageFeatureConfigItem,
  SyncActionConfig,
  SyncConditionConfig,
} from './sync-rules-config.js'

/**
 * Predicate (condition) used to determine if a particular rule applies to a given package.
 */
export type SyncConditionFn = (
  workspace: PackageMeta,
) => boolean | Promise<boolean>

/**
 * Action which is taken by a rule to modify the contents of a package.
 */
export type SyncActionFn = (
  workspace: PackageMeta,
) => SyncResult | Promise<SyncResult>

const appliesTo = async (
  workspace: PackageMeta,
  conditions: SyncConditionFn[] | undefined,
): Promise<boolean> => {
  if (conditions !== undefined && conditions.length > 0) {
    for (const condition of conditions) {
      const result = await condition(workspace)
      if (result) {
        return true
      }
    }

    return false
  } else {
    // no conditions == always configure this feature
    return true
  }
}

const makeConditionFn = (condition: SyncConditionConfig) => {
  if ('exists' in condition) {
    return makeExistsCondition(condition.exists)
  } else if ('notExists' in condition) {
    return makeNotExistsCondition(condition.notExists)
  }
  throw new Error('Unknown condition type')
}

const getActionImplementation = (action: SyncActionConfig): SyncActionFn => {
  switch (action.action) {
    case 'json-merge-patch':
      return makeJsonMergePatchAction(action.options)
    case 'json-patch':
      return makeJsonPatchAction(action.options)
    case 'write-file':
      return makeWriteFileAction(action.options)
  }
}

const makeActionFn = (
  action: SyncActionConfig,
  conditions: SyncConditionFn[] | undefined,
): SyncActionFn => {
  const delegate = getActionImplementation(action)
  return async (workspace) => {
    const applicable = await appliesTo(workspace, conditions)
    if (!applicable) {
      return {
        result: 'skipped',
      }
    }

    return delegate(workspace)
  }
}

const applyActions = async (
  workspace: PackageMeta,
  actions: SyncActionFn[] = [],
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
 * Create a package feature which can be applied to projects.
 * @param config The `PackageFeatureConfigItem` defining the conditions and actions for the feature
 * @param userConfig User-supplied configuration to customize feature configuration.
 * @returns The `PackageFeature` corresponding to the supplied configuration.
 */
const makePackageFeature = (
  config: PackageFeatureConfigItem,
  _userConfig: Configuration,
): PackageFeature => {
  const conditions = config.conditions?.map((condition) =>
    makeConditionFn(condition),
  )

  const actions = config.actions.map((action) => {
    const conditionFns = action.conditions?.map((config) =>
      makeConditionFn(config),
    )
    return makeActionFn(action, conditionFns)
  })

  return {
    configure: async (workspace: PackageMeta) => {
      const applicable = await appliesTo(workspace, conditions)

      return applicable ?
          applyActions(workspace, actions)
        : {
            result: 'skipped',
          }
    },
    name: config.name,
  }
}

/**
 * Create the package features to apply to a project.
 * @param config The configuration defining the features, and the conditions and actions for each.
 * @param userConfig User-supplied options to customize feature configuration.
 * @returns Set of `PackageFeature` objects applicable to the supplied configuration.
 */
export const makeSyncRules = ({
  config,
  featureConfig,
}: {
  /**
   * User-supplied repo-kit configuration used to customize how features are configured.
   */
  config: Configuration

  /**
   * The `PackageFeatureConfig` config defining the available features.
   */
  featureConfig: PackageFeatureConfig
}): PackageFeature[] =>
  featureConfig.features.map((feature) => makePackageFeature(feature, config))
