import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { defaultOutboxDir, findClipMix, mixContentType, safeName } from './outbox.js'

describe('outbox', () => {
  const dirs: string[] = []
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
  })

  it('defaults to ~/Music/Studio Outbox', () => {
    expect(defaultOutboxDir('/Users/kid')).toBe(path.join('/Users/kid', 'Music', 'Studio Outbox'))
  })

  it('sanitizes names like the watcher, ASCII whitespace only', () => {
    expect(safeName('Piano: Corner/2026?')).toBe('Piano Corner 2026')
    expect(safeName('Piano\u00a0Corner')).toBe('Piano\u00a0Corner') // an NBSP survives, as it does in Lua
    expect(safeName('a\u0085b')).toBe('a\u0085b') // C1 controls are not %c in Lua either
    expect(safeName('  trailing. ')).toBe('trailing')
  })

  it('maps mix formats to media types', () => {
    expect(mixContentType('x.wav')).toBe('audio/wav')
    expect(mixContentType('x.FLAC')).toBe('audio/flac')
    expect(mixContentType('x.mp3')).toBe('audio/mpeg')
    expect(mixContentType('x.bin')).toBe('application/octet-stream')
  })

  it('finds the mix through the manifest, only once the watcher recorded it', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'outbox-'))
    dirs.push(root)
    const project = path.join(root, 'Piano Corner')
    await fs.mkdir(project)
    await fs.writeFile(path.join(project, '20260922 - 0012 - Twinkle.wav'), '')
    await fs.writeFile(path.join(project, '20260922 - 0013 - Rondo.wav'), 'still rendering')
    await fs.writeFile(
      path.join(project, 'manifest.json'),
      JSON.stringify({
        clips: {
          '12': { number: 12, render: { mix: '20260922 - 0012 - Twinkle.wav' } },
          '13': { number: 13, render: null },
          '14': { number: 14, render: { mix: '../escape.wav' } },
          '15': { number: 15, render: { mix: '..' } },
        },
      }),
    )

    expect(await findClipMix(root, 'Piano Corner', 12)).toBe(path.join(project, '20260922 - 0012 - Twinkle.wav'))
    expect(await findClipMix(root, 'Piano Corner', 13)).toBeUndefined() // file exists, not finished
    expect(await findClipMix(root, 'Piano Corner', 14)).toBeUndefined() // never outside the folder
    expect(await findClipMix(root, 'Piano Corner', 15)).toBeUndefined()
    expect(await findClipMix(root, 'Nope', 12)).toBeUndefined()
  })
})
