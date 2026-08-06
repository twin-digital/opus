import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ConfigError, loadConfig, parseConfig } from './load.js'

const workspace = async (files: Record<string, string>): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mc-dev-server-config-'))
  for (const [name, text] of Object.entries(files)) {
    await writeFile(join(dir, name), text, 'utf8')
  }
  return dir
}

describe('loadConfig', () => {
  // d-wkcxcv2b — the default location simply not being there reads as an empty file
  it('reads an absent default location as an empty config', async () => {
    const dir = await workspace({})

    await expect(loadConfig(dir)).resolves.toEqual({ config: {} })
  })

  it.each(['.minecraft.yaml', '.minecraft.yml'])('reads %s from the current directory', async (name) => {
    const dir = await workspace({ [name]: 'level: dev\n' })

    await expect(loadConfig(dir)).resolves.toMatchObject({ config: { level: 'dev' } })
  })

  // d-wkcxcv2b — both default names present at once is an error rather than a precedence rule
  it('rejects both default names being present', async () => {
    const dir = await workspace({ '.minecraft.yaml': '', '.minecraft.yml': '' })

    await expect(loadConfig(dir)).rejects.toThrow(ConfigError)
  })

  // d-wkcxcv2b — a path given with --config and not found is an error
  it('rejects a --config path that is not there', async () => {
    const dir = await workspace({})

    await expect(loadConfig(dir, 'nowhere.yaml')).rejects.toThrow(ConfigError)
  })

  it('reads the file --config names', async () => {
    const dir = await workspace({ 'elsewhere.yaml': 'level: named\n' })

    await expect(loadConfig(dir, 'elsewhere.yaml')).resolves.toMatchObject({ config: { level: 'named' } })
  })
})

describe('parseConfig', () => {
  // the bound contract /mc-dev-kit/config@1
  it('accepts a file exercising every key', () => {
    const config = parseConfig(
      [
        'version: "1"',
        'level: dev',
        'seed: 424242',
        'spawn: [1, 2, 3]',
        'image: itzg/minecraft-bedrock-server:1.21',
        'port: 19140',
        'eula: true',
        'defaultProfile: scripts',
        'profiles:',
        '  scripts:',
        '    packs: ["@scope/one"]',
        '    level: other',
        '    seed: 7',
        '    spawn: [0, 64, 0]',
      ].join('\n'),
      'config.yaml',
    )

    expect(config).toEqual({
      version: '1',
      level: 'dev',
      seed: 424242n,
      spawn: [1, 2, 3],
      image: 'itzg/minecraft-bedrock-server:1.21',
      port: 19140,
      eula: true,
      defaultProfile: 'scripts',
      profiles: { scripts: { packs: ['@scope/one'], level: 'other', seed: 7n, spawn: [0, 64, 0] } },
    })
  })

  // d-41m3iws5 — the range's edges matter, so the seed must survive exactly
  it('keeps a 64-bit seed exactly', () => {
    expect(parseConfig('seed: 9223372036854775807\n', 'config.yaml').seed).toBe(9223372036854775807n)
  })

  // d-wkcxcv2b — a key the harness does not define is an error, and so is a value of the wrong shape
  it.each([
    ['an unknown top-level key', 'nope: true\n'],
    ['an unknown profile key', 'profiles:\n  one:\n    nope: true\n'],
    ['a non-string level', 'level: 3\n'],
    ['a spawn of the wrong length', 'spawn: [1, 2]\n'],
    ['a port out of range', 'port: 99999\n'],
    ['a version this schema does not define', 'version: "2"\n'],
  ])('rejects %s', (_name, text) => {
    expect(() => parseConfig(text, 'config.yaml')).toThrow(ConfigError)
  })

  // d-41m3iws5 — a seed the server would hash rather than keep is not a seed
  it.each(['seed: 9223372036854775808\n', 'profiles:\n  one:\n    seed: -9223372036854775809\n'])(
    'rejects a seed outside the signed 64-bit range',
    (text) => {
      expect(() => parseConfig(text, 'config.yaml')).toThrow(ConfigError)
    },
  )

  // d-wkcxcv2b — a file that cannot be parsed fails the run naming the file
  it('names the file when the YAML will not parse', () => {
    expect(() => parseConfig('level: [unclosed\n', 'config.yaml')).toThrow(/config\.yaml/)
  })
})
