import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { defaultOutboxDir, findClipMix, safeName } from './outbox.js'

describe('outbox', () => {
  const dirs: string[] = []
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
  })

  it('defaults to ~/Music/Studio Outbox', () => {
    expect(defaultOutboxDir('/Users/kid')).toBe(path.join('/Users/kid', 'Music', 'Studio Outbox'))
  })

  it('sanitizes names like the watcher', () => {
    expect(safeName('Piano: Corner/2026?')).toBe('Piano Corner 2026')
  })

  it('finds the mix by clip number, never the MIDI or manifest', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'outbox-'))
    dirs.push(root)
    const project = path.join(root, 'Piano Corner')
    await fs.mkdir(project)
    await fs.writeFile(path.join(project, '20260922 - 0012 - Twinkle.mid'), '')
    await fs.writeFile(path.join(project, '20260922 - 0012 - Twinkle.wav'), '')
    await fs.writeFile(path.join(project, 'manifest.json'), '{}')

    expect(await findClipMix(root, 'Piano Corner', 12)).toBe(path.join(project, '20260922 - 0012 - Twinkle.wav'))
    expect(await findClipMix(root, 'Piano Corner', 13)).toBeUndefined()
    expect(await findClipMix(root, 'Nope', 12)).toBeUndefined()
  })
})
