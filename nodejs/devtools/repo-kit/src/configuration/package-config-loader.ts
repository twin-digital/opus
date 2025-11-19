import path from 'node:path'
import {
  makeJsonFileLoader,
  makeLoaderChain,
  makePackageJsonLoader,
  makeYamlFileLoader,
  type ConfigurationLoaderFn,
} from './configuration-loader.js'

/**
 * Returns a `ConfigurationLoaderFn` which reads configuration for a package from any of the following:
 *
 * - package.json, under the key `configName`
 * - a yaml file called `.<CONFIG_NAME>.yaml` or `.<CONFIG_NAME>.yml`, in the package root
 * - a json file called `.<CONFIG_NAME>.json` in the package root
 *
 * For example, given the `configName` "test-config" and packagePath "/home/test", config will be sourced from:
 *
 * - `/home/test/package.json`, from the key `configName`
 * - `/home/test/.configName.yaml
 * - `/home/test/.configName.yml
 * - `/home/test/.configName.json
 *
 * The locations will be searched in the above order. The first value which exists will be used, and the other
 * sources will be silently ignored.
 *
 * @param configName Name of the configuration to find, used to construct file names or package manifest keys
 * @param packagePath Path of the package root, containing `package.json`
 * @returns The loaded configuration, or undefined if no such configuration exists.
 */
export const makePackageConfigLoader = (configName: string, packagePath: string): ConfigurationLoaderFn =>
  makeLoaderChain(
    makePackageJsonLoader(configName, packagePath),
    makeYamlFileLoader(path.join(packagePath, `.${configName}.yaml`)),
    makeYamlFileLoader(path.join(packagePath, `.${configName}.yml`)),
    makeJsonFileLoader(path.join(packagePath, `.${configName}.json`)),
  )
