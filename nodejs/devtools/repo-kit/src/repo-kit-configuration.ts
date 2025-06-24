import merge from 'lodash-es/merge.js'
import { makePackageConfigLoader } from './configuration/package-config-loader.js'

export interface Configuration {
  eslint: boolean
}

/**
 * Default repo-kit configuration. Any values which are not supplied by the user will be taken from here.
 */
export const DefaultConfiguration = {
  eslint: true,
} satisfies Configuration

/**
 * Given a partial configuration provided by the user, complete it by merging in any missing values from the
 * `DefaultConfiguration`.
 *
 * @param configuration Partial configuration to complete.
 * @returns A complete configuration object, with defaults.
 */
export const withDefaults = (
  configuration: Partial<Configuration> | undefined,
): Configuration => merge({}, DefaultConfiguration, configuration ?? {})

/**
 * Loads the repo-kit configuration, with any defaults applied.
 */
export const loadConfig = async (): Promise<Configuration> => {
  const loader = makePackageConfigLoader('repokit', process.cwd())
  const userConfig = (await loader()) as Partial<Configuration> | undefined
  return withDefaults(userConfig)
}
