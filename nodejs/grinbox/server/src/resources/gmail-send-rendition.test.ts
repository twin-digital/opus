import { describe, expect, it } from 'vitest'
import { buildRfc822 } from './gmail.js'

function decodeBase64(b64: string): string {
  return Buffer.from(b64, 'base64').toString('utf8')
}

describe('buildRfc822 renditions (d-rd986rrt, d-1oqjgi9m, d-or4jo6s1)', () => {
  it('without a rich rendition, sends the single-part plain-text mail unchanged', () => {
    const raw = buildRfc822({ to: 'a@b.c', subject: 'S', body: 'plain text' })
    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"')
    expect(raw).not.toContain('multipart/alternative')
    const b64 = raw.split('\r\n\r\n')[1]
    expect(decodeBase64(b64)).toBe('plain text')
  })

  it('with a rich rendition, sends one multipart/alternative mail carrying both', () => {
    const raw = buildRfc822({
      to: 'a@b.c',
      subject: 'S',
      body: 'plain text',
      body_rich: '<div>rich</div>',
    })
    expect(raw).toContain('multipart/alternative')
    const boundary = /boundary="([^"]+)"/.exec(raw)?.[1]
    expect(boundary).toBeDefined()
    const parts = raw.split(`--${boundary}`)
    // Preamble, text part, html part, closing marker.
    expect(parts).toHaveLength(4)
    expect(parts[1]).toContain('Content-Type: text/plain; charset="UTF-8"')
    expect(parts[2]).toContain('Content-Type: text/html; charset="UTF-8"')
    expect(decodeBase64(parts[1].split('\r\n\r\n')[1])).toBe('plain text')
    expect(decodeBase64(parts[2].split('\r\n\r\n')[1])).toBe('<div>rich</div>')
  })

  it('lists the plain text first so a client preferring the last alternative shows the rich one', () => {
    const raw = buildRfc822({ to: 'a@b.c', subject: 'S', body: 'p', body_rich: 'r' })
    expect(raw.indexOf('text/plain')).toBeLessThan(raw.indexOf('text/html'))
  })
})
