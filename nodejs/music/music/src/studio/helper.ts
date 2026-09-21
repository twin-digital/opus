import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { logger } from '../logger.js'

/**
 * The REAPER side of the studio: the watcher ReaScript this package ships, installed into
 * REAPER's resource path and identified by a hash of its bytes. The watcher publishes the hash
 * of the file it is running, and the app compares it with the copy it carries.
 */

const log = logger.child({}, { msgPrefix: '[HELPER] ' })

/** Files shipped in the package's `reaper/` folder that get installed. */
export const HelperFiles = {
  watcher: 'cs-studio-watcher.lua',
  startup: '__startup.lua',
  config: 'cs-studio-config.lua',
} as const

/** Where the watcher and its config live under REAPER's resource path. */
const SCRIPTS_SUBDIR = path.join('Scripts', 'Studio')

const bundledDir = () => new URL('../../reaper/', import.meta.url)

/**
 * FNV-1a (32-bit), written the same way as the watcher's Lua copy: no wide multiplies or
 * bitwise ops on the full word, so both give the same answer under any number model.
 */
export const fnv1a32 = (data: Uint8Array): string => {
  let h = 2166136261
  for (const byte of data) {
    const low = h % 256
    h = h - low + (low ^ byte)
    h = (h * 403 + (h % 256) * 16777216) % 4294967296 // h * 16777619 mod 2^32
  }
  return h.toString(16).padStart(8, '0')
}

export const readBundledHelper = async (name: keyof typeof HelperFiles): Promise<Uint8Array> =>
  new Uint8Array(await fs.readFile(new URL(HelperFiles[name], bundledDir())))

/** Hash of the watcher this package ships. */
export const bundledHelperHash = async (): Promise<string> => fnv1a32(await readBundledHelper('watcher'))

/**
 * REAPER's resource path: MUSIC_REAPER_RESOURCE_PATH, or the platform default (Options > Show
 * REAPER resource path in REAPER shows the real one).
 */
export const defaultResourcePath = (platform = process.platform, home = os.homedir()): string => {
  const configured = process.env.MUSIC_REAPER_RESOURCE_PATH?.trim()
  if (configured !== undefined && configured !== '') {
    return configured
  }
  switch (platform) {
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', 'REAPER')
    case 'win32':
      return path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'REAPER')
    default:
      return path.join(home, '.config', 'REAPER')
  }
}

export interface InstallResult {
  /** Files written or updated, relative to the resource path. */
  changed: string[]
  /** Path the watcher was installed at. */
  watcherPath: string
}

const sameBytes = async (file: string, wanted: Uint8Array) => {
  try {
    return Buffer.from(await fs.readFile(file)).equals(Buffer.from(wanted))
  } catch {
    return false
  }
}

/**
 * Installs the bundled watcher and startup hook under REAPER's resource path. The watcher is
 * overwritten when its bytes differ; the startup hook is created, or gets the line that loads
 * the watcher appended if it exists without one; the config file is created only when absent
 * and never touched afterwards, since it is the user's.
 */
export const installHelper = async (resourcePath: string): Promise<InstallResult> => {
  const changed: string[] = []
  const scriptsDir = path.join(resourcePath, SCRIPTS_SUBDIR)
  await fs.mkdir(scriptsDir, { recursive: true })

  const watcherPath = path.join(scriptsDir, HelperFiles.watcher)
  const watcher = await readBundledHelper('watcher')
  if (!(await sameBytes(watcherPath, watcher))) {
    await fs.writeFile(watcherPath, watcher)
    changed.push(path.relative(resourcePath, watcherPath))
  }

  const configPath = path.join(scriptsDir, HelperFiles.config)
  try {
    await fs.access(configPath)
  } catch {
    await fs.writeFile(configPath, await readBundledHelper('config'))
    changed.push(path.relative(resourcePath, configPath))
  }

  const startupPath = path.join(resourcePath, 'Scripts', HelperFiles.startup)
  const loader = `dofile(reaper.GetResourcePath() .. "/Scripts/Studio/${HelperFiles.watcher}")`
  let startup: string | undefined
  try {
    startup = await fs.readFile(startupPath, 'utf8')
  } catch {
    startup = undefined
  }
  if (startup === undefined) {
    await fs.writeFile(startupPath, Buffer.from(await readBundledHelper('startup')))
    changed.push(path.relative(resourcePath, startupPath))
  } else if (!startup.includes(loader)) {
    await fs.writeFile(
      startupPath,
      `${startup.trimEnd()}\n\n-- Starts the studio watcher; added by the studio app.\n${loader}\n`,
    )
    changed.push(path.relative(resourcePath, startupPath))
  }

  if (changed.length > 0) {
    log.info(`Installed into ${resourcePath}: ${changed.join(', ')}`)
  }
  return { changed, watcherPath }
}

/** What the watcher reports about itself, as read from REAPER. */
export interface HelperStatus {
  version: string
  hash: string
  /** Whether the running watcher is byte-for-byte the one this app ships. */
  matches: boolean
}

export const helperStatus = (
  ext: { watcher_version?: string; watcher_hash?: string },
  expectedHash: string,
): HelperStatus | undefined =>
  ext.watcher_hash === undefined || ext.watcher_hash === '' ?
    undefined
  : { version: ext.watcher_version ?? '', hash: ext.watcher_hash, matches: ext.watcher_hash === expectedHash }
