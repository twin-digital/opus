import { globMatches } from '../../utils/glob-matches.js'
import type { SyncConditionFn } from '../sync-rule-factory.js'

export const makeNotExistsCondition =
  (file: string): SyncConditionFn =>
  async (workspace) =>
    !(await globMatches(file, workspace.path))
