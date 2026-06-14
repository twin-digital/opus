import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { atomicWrite, payload, statusOkLine, statusStalledLine, writePayload } from './shelf.js'

describe('shelf formatting', () => {
  it('builds the {value, expires_at} payload', () => {
    expect(payload('tok', 1750000000)).toEqual({ value: 'tok', expires_at: 1750000000 })
    expect(payload('tok', null)).toEqual({ value: 'tok', expires_at: null })
  })

  it('formats status lines (epoch → ISO, passthrough ISO, unknown)', () => {
    expect(statusOkLine(0)).toBe('ok expires=1970-01-01T00:00:00.000Z\n')
    expect(statusOkLine('2026-01-01T00:00:00Z')).toBe('ok expires=2026-01-01T00:00:00Z\n')
    expect(statusOkLine()).toBe('ok expires=unknown\n')
    expect(statusStalledLine("run 'aws sso login'", '2026-06-14T00:00:00Z')).toBe(
      'stalled since=2026-06-14T00:00:00Z fix="run \'aws sso login\'"\n',
    )
  })
})

describe('atomic shelf writes', () => {
  it('writes payload JSON at mode 0600', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shelf-'))
    const dest = join(dir, 'github', 'twin-digital')
    writePayload(dest, 'secret-token', 1750000000)
    expect(JSON.parse(readFileSync(dest, 'utf8'))).toEqual({ value: 'secret-token', expires_at: 1750000000 })
    expect(statSync(dest).mode & 0o777).toBe(0o600)
  })

  it('leaves no temp file behind', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shelf-'))
    atomicWrite(join(dir, 'creds'), 'data')
    expect(readFileSync(join(dir, 'creds'), 'utf8')).toBe('data')
  })
})
