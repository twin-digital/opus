// @vitest-environment node
import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { quietLinkErrors } from '../scripts/proxy-errors.js'

const URL = 'ws://127.0.0.1:4750/link'

/** A proxy with a listener that stands for the Vite handler. */
const setup = () => {
  const lines: string[] = []
  const vite: Error[] = []
  const proxy = new EventEmitter()
  quietLinkErrors(URL, (line) => lines.push(line))(proxy)
  proxy.on('error', (error: Error) => vite.push(error))
  const fail = (code: string, message = code) => {
    const sockets: string[] = []
    proxy.emit('error', Object.assign(new Error(message), { code }), {}, { end: () => sockets.push('end') })
    return sockets
  }
  return { lines, vite, proxy, fail }
}

describe('quietLinkErrors', () => {
  it('prints one short line and no stack trace for a refused connection', () => {
    const { lines, vite, fail } = setup()
    const sockets = fail('ECONNREFUSED')
    expect(lines).toEqual([`wishem: no construct at ${URL}; the page connects again`])
    expect(vite).toEqual([])
    expect(sockets).toEqual(['end'])
  })

  it('prints the line once until a link succeeds', () => {
    const { lines, proxy, fail } = setup()
    fail('ECONNREFUSED')
    fail('ECONNREFUSED')
    fail('ECONNRESET')
    expect(lines).toHaveLength(1)
    proxy.emit('open', {})
    fail('ECONNREFUSED')
    expect(lines).toHaveLength(2)
  })

  it('prints a short line for a reset connection', () => {
    const { lines, vite, fail } = setup()
    fail('ECONNRESET')
    expect(lines).toEqual([`wishem: the link to ${URL} closed; the page connects again`])
    expect(vite).toEqual([])
  })

  it('gives another error to the handler of Vite', () => {
    const { lines, vite, fail } = setup()
    fail('EPIPE', 'broken pipe')
    expect(lines).toEqual([])
    expect(vite.map((error) => error.message)).toEqual(['broken pipe'])
  })
})
