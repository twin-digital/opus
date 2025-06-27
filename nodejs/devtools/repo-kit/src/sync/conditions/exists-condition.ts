import type { SyncConditionFn } from '../sync-rule-factory.js'
import { globMatches } from '../../utils/glob-matches.js'

export const makeExistsCondition =
  (file: string): SyncConditionFn =>
  (workspace) =>
    globMatches(file, workspace.path)
