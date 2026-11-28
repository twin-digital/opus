// @vitest-environment node
import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { quietLinkErrors } from '../scripts/proxy-errors.js'

const URL = 'ws://127.0.0.1:4750/link'

const failure = (code: string, message = code) => Object.assign(new Error(message), { code })

/** A proxy with a listener that stands for the Vite handler. */
const setup = () => {
  const lines: string[] = []
  const vite: Error[] = []
  const proxy = new EventEmitter()
  quietLinkErrors(URL, (line) => lines.push(line))(proxy)
  proxy.on('error', (error: Error) => vite.push(error))
  const fail = (code: string, message = code, error = failure(code, message)) => {
    const sockets: string[] = []
    const result = proxy.emit('error', error, {}, { end: () => sockets.push('end') })
    return { sockets, result }
  }
  /** A link that opened; the socket of the construct. */
  const open = () => {
    const target = Object.assign(new EventEmitter(), { errored: null as Error | null })
    proxy.emit('open', target)
    return target
  }
  return { lines, vite, proxy, fail, open }
}

describe('quietLinkErrors', () => {
  it('prints one short line and no stack trace for a refused connection', () => {
    const { lines, vite, fail } = setup()
    const { sockets } = fail('ECONNREFUSED')
    expect(lines).toEqual([`wishem: no construct at ${URL}; the page connects again`])
    expect(vite).toEqual([])
    expect(sockets).toEqual(['end'])
  })

  it('prints the line once until a link succeeds', () => {
    const { lines, proxy, fail, open } = setup()
    fail('ECONNREFUSED')
    fail('ECONNREFUSED')
    expect(lines).toHaveLength(1)
    open()
    fail('ECONNREFUSED')
    expect(lines).toHaveLength(2)
  })

  it('prints a short line when the construct resets the link', () => {
    const { lines, vite, fail, open } = setup()
    const target = open()
    const error = failure('ECONNRESET')
    target.errored = error
    const { sockets } = fail('ECONNRESET', 'x', error)
    expect(lines).toEqual([`wishem: the link to ${URL} closed; the page connects again`])
    expect(vite).toEqual([])
    expect(sockets).toEqual(['end'])
  })

  it('prints nothing for a reset that does not come from the construct, and ends the socket', () => {
    const { lines, vite, fail, open } = setup()
    open()
    const { sockets } = fail('ECONNRESET')
    expect(lines).toEqual([])
    expect(vite).toEqual([])
    expect(sockets).toEqual(['end'])
  })

  it('does not use up the line with a reset of the page', () => {
    const { lines, fail } = setup()
    fail('ECONNRESET')
    fail('ECONNREFUSED')
    expect(lines).toEqual([`wishem: no construct at ${URL}; the page connects again`])
  })

  it('gives another error to the handler of Vite, and does not end the socket', () => {
    const { lines, vite, fail } = setup()
    const { sockets } = fail('EPIPE', 'broken pipe')
    expect(lines).toEqual([])
    expect(vite.map((error) => error.message)).toEqual(['broken pipe'])
    expect(sockets).toEqual([])
  })

  it('gives an event that is not an error to its listeners, with its arguments and result', () => {
    const { proxy } = setup()
    const seen: unknown[][] = []
    proxy.on('close', (...args: unknown[]) => seen.push(args))
    expect(proxy.emit('close', 1, 2)).toBe(true)
    expect(proxy.emit('start')).toBe(false)
    expect(seen).toEqual([[1, 2]])
  })

  it('answers a plain HTTP request with status 502 and a short text', () => {
    const { lines, proxy, vite } = setup()
    const calls: unknown[][] = []
    const res = {
      req: {},
      headersSent: false,
      writeHead: (...args: unknown[]) => calls.push(['writeHead', ...args]),
      end: (...args: unknown[]) => calls.push(['end', ...args]),
    }
    proxy.emit('error', failure('ECONNREFUSED'), {}, res)
    expect(calls).toEqual([
      ['writeHead', 502, { 'Content-Type': 'text/plain' }],
      ['end', `wishem: no construct at ${URL}; the page connects again`],
    ])
    expect(lines).toHaveLength(1)
    expect(vite).toEqual([])
  })

  it('does not write the head of an HTTP answer twice', () => {
    const { proxy } = setup()
    const calls: string[] = []
    const res = {
      req: {},
      headersSent: true,
      writeHead: () => calls.push('writeHead'),
      end: () => calls.push('end'),
    }
    proxy.emit('error', failure('ECONNREFUSED'), {}, res)
    expect(calls).toEqual(['end'])
  })

  describe('the error of the page socket', () => {
    /** The listener for `proxyReqWs` stands for the one of Vite. */
    const withPage = () => {
      const setupResult = setup()
      const seen: Error[] = []
      setupResult.proxy.on('proxyReqWs', (_req: unknown, _page: unknown, socket: EventEmitter) => {
        socket.on('error', (error: Error) => seen.push(error))
      })
      const page = new EventEmitter()
      setupResult.proxy.emit('proxyReqWs', {}, {}, page)
      return { ...setupResult, page, seen }
    }

    it('does not give a reset to the handler of Vite', () => {
      const { page, seen } = withPage()
      page.emit('error', failure('ECONNRESET'))
      expect(seen).toEqual([])
    })

    it('gives another error to the handler of Vite', () => {
      const { page, seen } = withPage()
      page.emit('error', failure('EPIPE', 'broken pipe'))
      expect(seen.map((error) => error.message)).toEqual(['broken pipe'])
    })
  })
})
