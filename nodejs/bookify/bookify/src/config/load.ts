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
  const resolvedConfigPath = path.resolve(projectConfigPath)
  const configContent = await fsP.readFile(resolvedConfigPath, 'utf-8')
  const unvalidatedConfig = yaml.parse(configContent) as unknown

  if (!validateConfig(unvalidatedConfig)) {
    const errors = validateConfig.errors?.map((e) => `${e.instancePath} ${e.message}`).join(', ')
    throw new Error(`Invalid project configuration: ${errors}`)
  }

  // Resolve all paths relative to the directory containing the config file
  const configDir = path.dirname(resolvedConfigPath)
  return resolveConfig(unvalidatedConfig, configDir)
}
