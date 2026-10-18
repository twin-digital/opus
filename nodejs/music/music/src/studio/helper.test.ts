import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  bundledHelperHash,
  defaultResourcePath,
  fnv1a32,
  helperStatus,
  installHelper,
  readBundledHelper,
} from './helper.js'

describe('fnv1a32', () => {
  // vectors produced by the watcher's Lua implementation
  it.each([
    ['', '811c9dc5'],
    ['a', 'e40c292c'],
    ['hello studio', 'beb8427f'],
  ])('hashes %j like the Lua copy', (input, expected) => {
    expect(fnv1a32(Buffer.from(input))).toBe(expected)
  })

  it('hashes raw bytes like the Lua copy', () => {
    expect(fnv1a32(Uint8Array.from([255, 0, 16]))).toBe('336db72e')
  })
})

describe('bundled helper', () => {
  it('ships the watcher and hashes it', async () => {
    const watcher = Buffer.from(await readBundledHelper('watcher')).toString('utf8')
    expect(watcher).toContain('cs-studio-config.lua')
    expect(await bundledHelperHash()).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('defaultResourcePath', () => {
  it('follows the platform, unless overridden', () => {
    expect(defaultResourcePath('darwin', '/Users/kid')).toBe('/Users/kid/Library/Application Support/REAPER')
    expect(defaultResourcePath('linux', '/home/kid')).toBe('/home/kid/.config/REAPER')
  })
})

describe('installHelper', () => {
  const dirs: string[] = []
  const tempDir = async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-helper-'))
    dirs.push(dir)
    return dir
  }

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
  })

  it('installs the watcher, config, and startup hook into an empty resource path', async () => {
    const root = await tempDir()
    const result = await installHelper(root)
    expect(result.changed.sort()).toEqual(
      ['Scripts/Studio/cs-studio-config.lua', 'Scripts/Studio/cs-studio-watcher.lua', 'Scripts/__startup.lua'].sort(),
    )
    expect(await fs.readFile(path.join(root, 'Scripts', '__startup.lua'), 'utf8')).toContain('cs-studio-watcher.lua')

    // a second run changes nothing
    expect((await installHelper(root)).changed).toEqual([])
  })

  it('updates a stale watcher but leaves the config alone', async () => {
    const root = await tempDir()
    await installHelper(root)
    const watcherPath = path.join(root, 'Scripts', 'Studio', 'cs-studio-watcher.lua')
    const configPath = path.join(root, 'Scripts', 'Studio', 'cs-studio-config.lua')
    await fs.writeFile(watcherPath, '-- old')
    await fs.writeFile(configPath, 'return { debug = true }')

    const result = await installHelper(root)
    expect(result.changed).toEqual(['Scripts/Studio/cs-studio-watcher.lua'])
    expect(await fs.readFile(configPath, 'utf8')).toBe('return { debug = true }')
  })

  it('appends its loader to an existing startup hook', async () => {
    const root = await tempDir()
    await fs.mkdir(path.join(root, 'Scripts'), { recursive: true })
    await fs.writeFile(path.join(root, 'Scripts', '__startup.lua'), 'reaper.ShowConsoleMsg("mine\\n")\n')

    await installHelper(root)
    const startup = await fs.readFile(path.join(root, 'Scripts', '__startup.lua'), 'utf8')
    expect(startup).toContain('mine')
    expect(startup).toContain('cs-studio-watcher.lua')

    // and not twice
    await installHelper(root)
    expect(
      (await fs.readFile(path.join(root, 'Scripts', '__startup.lua'), 'utf8')).split('cs-studio-watcher.lua'),
    ).toHaveLength(2)
  })
})

describe('helperStatus', () => {
  it('is undefined until the watcher has published, then compares hashes', () => {
    expect(helperStatus({}, 'abc')).toBeUndefined()
    expect(helperStatus({ watcher_hash: 'abc', watcher_version: '1' }, 'abc')).toEqual({
      version: '1',
      hash: 'abc',
      matches: true,
    })
    expect(helperStatus({ watcher_hash: 'old' }, 'abc')).toEqual({ version: '', hash: 'old', matches: false })
  })
})
