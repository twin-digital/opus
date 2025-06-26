import fs from 'node:fs'
import path from 'node:path'
import type { SyncRuleConditionFn } from '../sync-rule-factory.js'

export const makeExistsCondition =
  (file: string): SyncRuleConditionFn =>
  (workspace) =>
    fs.existsSync(path.join(workspace.path, file))
