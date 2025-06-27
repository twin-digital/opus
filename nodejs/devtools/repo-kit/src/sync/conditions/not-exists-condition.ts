import type { SyncRuleConditionFn } from '../sync-rule-factory.js'
import { globMatches } from '../../utils/glob-matches.js'

export const makeNotExistsCondition =
  (file: string): SyncRuleConditionFn =>
  async (workspace) =>
    !(await globMatches(file, workspace.path))
