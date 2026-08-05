import { readFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'

import Ajv2020 from 'ajv/dist/2020.js'
import { parse as parseYaml } from 'yaml'

import { SEED_MAX, SEED_MIN } from '../seed.js'
import { configSchema } from './schema.js'

import type { LoadedConfig, Profile, Spawn, WorkspaceConfig } from './types.js'

/** The two names the harness looks for in the current directory. */
export const CONFIG_FILE_NAMES = ['.minecraft.yaml', '.minecraft.yml'] as const

/** A config the harness could not read, parse, or accept. Always names the file. */
export class ConfigError extends Error {
  constructor(
    message: string,
    readonly file?: string,
  ) {
    super(message)
    this.name = 'ConfigError'
  }
}

const ajv = new Ajv2020.default({ allErrors: true, strict: false })
const validate = ajv.compile(configSchema)

const exists = async (path: string): Promise<boolean> => {
  try {
    await readFile(path)
    return true
  } catch {
    return false
  }
}

/**
 * Finds the config file a run reads. `configPath` points at one explicitly and not finding it is
 * an error; the default location simply not being there is not, and both default names present at
 * once is.
 */
export const findConfigFile = async (cwd: string, configPath?: string): Promise<string | undefined> => {
  if (configPath !== undefined) {
    const absolute = isAbsolute(configPath) ? configPath : resolve(cwd, configPath)
    if (!(await exists(absolute))) {
      throw new ConfigError(`config file not found: ${absolute}`, absolute)
    }
    return absolute
  }

  const present: string[] = []
  for (const name of CONFIG_FILE_NAMES) {
    const candidate = resolve(cwd, name)
    if (await exists(candidate)) {
      present.push(candidate)
    }
  }

  if (present.length > 1) {
    throw new ConfigError(`both ${CONFIG_FILE_NAMES.join(' and ')} are present; keep one`, present[0])
  }
  return present[0]
}

const toSpawn = (value: unknown): Spawn | undefined => {
  if (!Array.isArray(value)) {
    return undefined
  }
  return [Number(value[0]), Number(value[1]), Number(value[2])]
}

// the schema's bounds are not exactly representable as JS numbers, so the range is enforced here
const toSeed = (value: unknown, where: string, file: string): bigint => {
  const seed = typeof value === 'bigint' ? value : BigInt(value as number)
  if (seed < SEED_MIN || seed > SEED_MAX) {
    throw new ConfigError(`${file}: ${where} is outside the signed 64-bit range`, file)
  }
  return seed
}

/**
 * Reads and validates a config file's text. Validation runs against the plain parse, and the seed
 * is taken from a second parse that keeps integers as bigints, so a 64-bit seed survives exactly.
 */
export const parseConfig = (text: string, file: string): WorkspaceConfig => {
  let plain: unknown
  let exact: unknown
  try {
    plain = parseYaml(text) ?? {}
    exact = parseYaml(text, { intAsBigInt: true }) ?? {}
  } catch (error) {
    throw new ConfigError(`${file}: ${(error as Error).message}`, file)
  }

  if (!validate(plain)) {
    const detail = (validate.errors ?? [])
      .map((e) => `${e.instancePath === '' ? '(root)' : e.instancePath} ${e.message ?? ''}`.trim())
      .join('; ')
    throw new ConfigError(`${file}: ${detail}`, file)
  }

  const raw = exact as Record<string, unknown>
  const rawProfiles = (raw.profiles ?? {}) as Record<string, Record<string, unknown>>
  const profiles: Record<string, Profile> = {}
  for (const [name, profile] of Object.entries(rawProfiles)) {
    profiles[name] = {
      ...(profile.packs === undefined ? {} : { packs: profile.packs as readonly string[] }),
      ...(profile.level === undefined ? {} : { level: profile.level as string }),
      ...(profile.seed === undefined ? {} : { seed: toSeed(profile.seed, `profiles.${name}.seed`, file) }),
      ...(profile.spawn === undefined ? {} : { spawn: toSpawn(profile.spawn) }),
    }
  }

  return {
    ...(raw.version === undefined ? {} : { version: '1' as const }),
    ...(raw.level === undefined ? {} : { level: raw.level as string }),
    ...(raw.seed === undefined ? {} : { seed: toSeed(raw.seed, 'seed', file) }),
    ...(raw.spawn === undefined ? {} : { spawn: toSpawn(raw.spawn) }),
    ...(raw.image === undefined ? {} : { image: raw.image as string }),
    ...(raw.port === undefined ? {} : { port: Number(raw.port) }),
    ...(raw.eula === undefined ? {} : { eula: raw.eula as boolean }),
    ...(raw.defaultProfile === undefined ? {} : { defaultProfile: raw.defaultProfile as string }),
    ...(raw.profiles === undefined ? {} : { profiles }),
  }
}

/** Loads the config a run reads. An absent default location reads the same as an empty file. */
export const loadConfig = async (cwd: string, configPath?: string): Promise<LoadedConfig> => {
  const file = await findConfigFile(cwd, configPath)
  if (file === undefined) {
    return { config: {} }
  }

  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    throw new ConfigError(`${file}: ${(error as Error).message}`, file)
  }

  return { path: file, config: parseConfig(text, file) }
}
