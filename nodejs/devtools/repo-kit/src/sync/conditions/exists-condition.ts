import type { SyncRuleConditionFn } from '../sync-rule-factory.js'
import { globMatches } from '../../utils/glob-matches.js'

export const makeExistsCondition =
  (file: string): SyncRuleConditionFn =>
  (workspace) =>
    globMatches(file, workspace.path)
