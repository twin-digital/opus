import fs from 'node:fs'
import fsP from 'node:fs/promises'
import path from 'node:path'
import type { SyncRuleActionFn } from '../sync-rule-factory.js'

/**
 * Creates a `SyncRule` action which writes a file into the package at a specified path. If the file already exists, it
 * will be replaced with the new content.
 *
 * @param file Path of the file to write, relative to the package root.
 * @param options Options used to create the file.
 * @returns An `ok` result if the file was created or modified, or `skipped` if no changes were needed.
 */
export const makeWriteFileAction =
  (
    file: string,
    options: {
      /**
       * Contents to write at the specified file. Will replace any existing content.
       */
      content: string
    },
  ): SyncRuleActionFn =>
  async (workspace) => {
    const filePath = path.join(workspace.path, file)
    const previousContent =
      fs.existsSync(filePath) ?
        await fsP.readFile(filePath, 'utf-8')
      : undefined
    const changed =
      previousContent === undefined || previousContent !== options.content

    if (changed) {
      await fsP.writeFile(filePath, options.content, 'utf-8')
      return {
        changedFiles: [file],
        result: 'ok',
      }
    }

    return {
      result: 'skipped',
    }
  }
