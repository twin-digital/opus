import fsP from 'node:fs/promises'
import path from 'node:path'
import yaml from 'yaml'

const ASSETS_ROOT = path.join(import.meta.dirname, 'assets')

/**
 * Converts an asset name into an absolute asset path on disk.
 * @param asset Name of the asset, relative to the root asset directory and with no leading slash.
 * @returns Absolute path to the asset file.
 */
export const getAssetPath = (asset: string): string =>
  path.join(ASSETS_ROOT, asset)

/**
 * Loads the named asset, and parses it as a JSON string. Returns the parsing result.
 * @param asset Name of the asset, relative to the root asset directory
 * @returns Content of the asset, as a parsed JSON object
 */
export const loadJsonAsset = async <T = unknown>(asset: string): Promise<T> => {
  const text = await loadTextAsset(asset)
  return JSON.parse(text) as T
}

/**
 * Loads the named asset, and returns its contents as a UTF-8 string.
 * @param asset Name of the asset, relative to the root asset directory
 * @returns Content of the asset
 */
export const loadTextAsset = (asset: string): Promise<string> =>
  fsP.readFile(getAssetPath(asset), 'utf-8')

/**
 * Loads the named asset, and parses it as a YAML string. Returns the parsing result.
 * @param asset Name of the asset, relative to the root asset directory
 * @returns Content of the asset, as a parsed YAML object
 */
export const loadYamlAsset = async <T = unknown>(asset: string): Promise<T> => {
  const text = await loadTextAsset(asset)
  return yaml.parse(text) as T
}
