import fsP from 'node:fs/promises'
import path from 'node:path'
import type { SyncRuleActionFn } from '../legacy-sync-rule.js'
import jsonMergePatch from 'json-merge-patch'
import yaml from 'yaml'

export const makeJsonMergePatchAction =
  (file: string, options: { patch: string }): SyncRuleActionFn =>
  async (workspace) => {
    const filePath = path.join(workspace.path, file)
    const original = await fsP.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(original) as object
    const patch = yaml.parse(options.patch) as object

    const result = jsonMergePatch.apply(parsed, patch)
    const newContent = `${JSON.stringify(result, null, 2)}\n`

    if (original !== newContent) {
      await fsP.writeFile(filePath, newContent, 'utf-8')
      return {
        changedFiles: [file],
        result: 'ok',
      }
    }

    return {
      result: 'skipped',
    }
  }
