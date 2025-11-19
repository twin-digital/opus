import fs from 'node:fs'
import path from 'node:path'
import type { ConfigValue } from './configuration.js'
import get from 'lodash-es/get.js'
import yaml from 'yaml'

/**
 * Function which is able to load configuration from an implementation-specific source. Will return undefined if the
 * underlying source of configuration data does not exist.
 */
export type ConfigurationLoaderFn = () => ConfigValue | Promise<ConfigValue> | undefined | Promise<undefined>

/**
 * Returns a `ConfigurationLoaderFn` which reads configuration from a specified file.
 *
 * @param file Absolute path to the config file
 * @return A ConfigurationLoaderFn that returns the file content
 */
export const makeJsonFileLoader =
  (file: string): ConfigurationLoaderFn =>
  async () => {
    if (fs.existsSync(file)) {
      const content = await fs.promises.readFile(file, 'utf-8')
      return JSON.parse(content) as ConfigValue
    }

    return undefined
  }

/**
 * A configuration loader function which returns the value of a single value from the return value of another loader.
 * @param key Key (or array of nested keys) of the config value to select.
 */
export const makeKeySelector =
  (key: string | string[], delegateLoader: ConfigurationLoaderFn): ConfigurationLoaderFn =>
  async () => {
    const allConfig = await delegateLoader()
    return get(allConfig, key) as ConfigValue
  }

/**
 * Creates a "chain" configuration loader which invokes a delegate loaders in order. The chain will return the first
 * configuration value received which is not undefined. If all delegates return undefined, the chain will return
 * undefined as well.
 */
export const makeLoaderChain =
  (...loaders: ConfigurationLoaderFn[]): ConfigurationLoaderFn =>
  async () => {
    for (const loader of loaders) {
      const result = await loader()
      if (result !== undefined) {
        return result
      }
    }

    return undefined
  }

/**
 * Creates a configuration loader which returns the value of a specific key from the `package.json` file found at the
 * supplied path.
 * @param key Key to return from the package.json file
 * @param packagePath Package path, containing the package.json file
 */
export const makePackageJsonLoader = (key: string | string[], packagePath: string): ConfigurationLoaderFn =>
  makeKeySelector(key, makeJsonFileLoader(path.join(packagePath, 'package.json')))

/**
 * Returns a `ConfigurationLoaderFn` which reads configuration from a specified Yaml file.
 *
 * @param file Absolute path to the config file
 * @return A ConfigurationLoaderFn that returns the file content
 */
export const makeYamlFileLoader =
  (file: string): ConfigurationLoaderFn =>
  async () => {
    if (fs.existsSync(file)) {
      const content = await fs.promises.readFile(file, 'utf-8')
      return yaml.parse(content) as ConfigValue
    }

    return undefined
  }
