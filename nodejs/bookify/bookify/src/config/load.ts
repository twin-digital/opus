import fsP from 'node:fs/promises'
import path from 'node:path'
import yaml from 'yaml'
import type { BookifyProject } from './model.js'
import { validateConfig } from './validate.js'
import { resolveConfig } from './resolve.js'

/**
 * Given a path (relative to the cwd) of a `.bookify.yml` file, load the configuration from the yaml and return
 * the corresponding project.
 *
 * @param projectConfigPath cwd-relative path to a .bookify.yml
 */
export const loadConfig = async (projectConfigPath: string): Promise<BookifyProject> => {
  const configContent = await fsP.readFile(path.resolve(projectConfigPath), 'utf-8')
  const unvalidatedConfig = yaml.parse(configContent) as unknown

  if (!validateConfig(unvalidatedConfig)) {
    const errors = validateConfig.errors?.map((e) => `${e.instancePath} ${e.message}`).join(', ')
    throw new Error(`Invalid project configuration: ${errors}`)
  }

  return resolveConfig(unvalidatedConfig)
}
