import { makePackageConfigLoader } from './configuration/package-config-loader.js'

export interface Configuration {
  /**
   * Sync rule configuration. Each key is the name of a sync rule, and the boolean is whether that rule is enabled
   * or not. By default, all rules are enabled.
   */
  rules?: Partial<Record<string, boolean>>
}

/**
 * Loads the repo-kit configuration, with any defaults applied.
 */
export const loadConfig = async (): Promise<Configuration> => {
  const loader = makePackageConfigLoader('repokit', process.cwd())
  const userConfig = (await loader()) as Configuration | undefined
  return userConfig ?? {}
}
