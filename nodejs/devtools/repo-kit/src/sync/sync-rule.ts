import { some } from 'lodash-es'
import { makeJsonMergePatchAction } from './actions/json-merge-patch.js'
import { makeExistsCondition } from './conditions/exists-condition.js'
import type {
  SyncRuleActionFn,
  SyncRuleConditionFn,
} from './legacy-sync-rule.js'
import type {
  SyncRuleConfigEntry,
  SyncRulesAction,
  SyncRulesCondition,
  SyncRulesConfig,
} from './sync-rules-config.js'
import type { PackageMeta } from '../workspace/package-meta.js'
import { type SyncResult } from './sync-result.js'
import type { Configuration } from '../repo-kit-configuration.js'

export interface SyncOptions {
  /**
   * The repo-kit configuration which applies to the package.
   */
  configuration: Configuration
}

export class SyncRule {
  private applyActions: SyncRuleActionFn[] = []
  private conditions: SyncRuleConditionFn[] = []
  private _name: string
  private unapplyActions: SyncRuleActionFn[] = []

  public static fromConfig(config: SyncRuleConfigEntry) {
    const that = new SyncRule(config.name)
    config.conditions.forEach((condition) => {
      that.addCondition(condition)
    })
    config.applyActions.forEach((action) => {
      that.addApplyAction(action as SyncRulesAction<{ patch: string }>)
    })
    config.unapplyActions?.forEach((action) => {
      that.addUnapplyAction(action as SyncRulesAction<{ patch: string }>)
    })

    return that
  }

  private async doApplyActions(
    workspace: PackageMeta,
    options: SyncOptions,
    actions: SyncRuleActionFn[] = [],
  ): Promise<SyncResult> {
    const changedFiles: string[] = []
    for (const action of actions) {
      const result = await action(workspace, options)
      if (result.result === 'error') {
        return result
      } else if (result.result === 'ok') {
        changedFiles.push(...result.changedFiles)
      }
    }

    return changedFiles.length === 0 ?
        { result: 'skipped' }
      : {
          changedFiles,
          result: 'ok',
        }
  }

  private constructor(name: string) {
    this._name = name
  }

  private addApplyAction(config: SyncRulesAction<{ patch: string }>) {
    const action = makeJsonMergePatchAction(config.file, config.options)
    this.applyActions.push(action)
  }

  private addCondition(config: SyncRulesCondition) {
    const condition = makeExistsCondition(config.exists)
    this.conditions.push(condition)
  }

  private addUnapplyAction(config: SyncRulesAction<{ patch: string }>) {
    const action = makeJsonMergePatchAction(config.file, config.options)
    this.unapplyActions.push(action)
  }

  /**
   * Apply this rule to a given workspace. If the workspace matches any condition, the 'applyActions' are executed.
   * Otherwise, the 'unapplyActions' are executed instead.
   *
   * @param workspace Metadata for the package to which the rule will be applied.
   * @param options Execution context, containing the user-supplied configuration and other global metadata.
   */
  public apply(
    workspace: PackageMeta,
    options: SyncOptions,
  ): Promise<SyncResult> {
    const isApplicable = some(this.conditions, (fn) => fn(workspace, options))

    return isApplicable ?
        this.doApplyActions(workspace, options, this.applyActions)
      : this.doApplyActions(workspace, options, this.unapplyActions)
  }

  public get name(): string {
    return this._name
  }
}

export const makeSyncRules = (config: SyncRulesConfig): SyncRule[] =>
  config.syncRules.map((rule) => SyncRule.fromConfig(rule))
