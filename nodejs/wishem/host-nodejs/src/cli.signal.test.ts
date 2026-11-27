import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Construct } from './start-construct.js'

vi.mock('./start-construct.js', () => ({ DEFAULT_PORT: 4747, startConstruct: vi.fn() }))

type Handler = () => void

describe('the stop signal during the start of the wishem command', () => {
  let handlers: Map<string, Handler>
  let output: string[]
  let exitCodes: (number | undefined)[]
  let close: ReturnType<typeof vi.fn<() => Promise<void>>>
  let finish: (construct: Construct) => void
  let fail: (error: Error) => void
  const argv = process.argv

  const load = async () => {
    const { startConstruct } = await import('./start-construct.js')
    vi.mocked(startConstruct).mockReturnValue(
      new Promise<Construct>((resolve, reject) => {
        finish = resolve
        fail = reject
      }),
    )
    process.argv = ['node', 'cli.js', 'start', '/model', '--port', '0']
    return import('./cli.js')
  }

  const construct = () =>
    ({
      linkUrl: 'ws://127.0.0.1:1/link',
      hub: { read: () => ({ store: { definitions: [], entities: [] } }) },
      close,
    }) as unknown as Construct

  beforeEach(() => {
    vi.resetModules()
    handlers = new Map()
    output = []
    exitCodes = []
    close = vi.fn<() => Promise<void>>(() => Promise.resolve())
    vi.spyOn(process, 'once').mockImplementation(((event: string, handler: Handler) => {
      handlers.set(event, handler)
      return process
    }) as never)
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      exitCodes.push(code)
    }) as never)
    vi.spyOn(console, 'log').mockImplementation((line: string) => {
      output.push(line)
    })
    vi.spyOn(console, 'error').mockImplementation((line: string) => {
      output.push(line)
    })
  })

  afterEach(() => {
    process.argv = argv
    vi.restoreAllMocks()
  })

  it('registers the handlers before the construct starts', async () => {
    const loaded = load()
    await vi.waitFor(() => {
      expect(output).toContain('wishem: model /model')
    })
    expect([...handlers.keys()].sort()).toEqual(['SIGINT', 'SIGTERM'])
    finish(construct())
    await loaded
  })

  it.each(['SIGINT', 'SIGTERM'])('closes the construct at once after %s during the start', async (signal) => {
    const loaded = load()
    await vi.waitFor(() => {
      expect(handlers.get(signal)).toBeDefined()
    })
    handlers.get(signal)?.()
    finish(construct())
    await loaded
    await vi.waitFor(() => {
      expect(exitCodes).toEqual([0])
    })
    expect(close).toHaveBeenCalledTimes(1)
    expect(output.join('\n')).not.toContain('link at')
    expect(output.join('\n')).not.toContain('component type')
  })

  it('exits with code 1 for a start that fails after a signal', async () => {
    const loaded = load()
    await vi.waitFor(() => {
      expect(handlers.get('SIGINT')).toBeDefined()
    })
    handlers.get('SIGINT')?.()
    fail(new Error('boom'))
    await loaded
    expect(exitCodes).toEqual([1])
    expect(close).not.toHaveBeenCalled()
  })

  it('closes one time for two signals after the start', async () => {
    const loaded = load()
    await vi.waitFor(() => {
      expect(output).toContain('wishem: model /model')
    })
    finish(construct())
    await loaded
    expect(output).toContain('wishem: link at ws://127.0.0.1:1/link')
    handlers.get('SIGINT')?.()
    handlers.get('SIGTERM')?.()
    await vi.waitFor(() => {
      expect(exitCodes).toEqual([0])
    })
    expect(close).toHaveBeenCalledTimes(1)
  })
  it('closes the construct and then exits with code 1 after a watch error', async () => {
    const loaded = load()
    await vi.waitFor(() => {
      expect(output).toContain('wishem: model /model')
    })
    finish(construct())
    await loaded
    const { startConstruct } = await import('./start-construct.js')
    vi.mocked(startConstruct).mock.lastCall?.[0].onWatchError?.(new Error('watch broke'))
    await vi.waitFor(() => {
      expect(exitCodes).toEqual([1])
    })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('exits with code 1 after a watch error before the construct starts', async () => {
    const loaded = load()
    await vi.waitFor(() => {
      expect(output).toContain('wishem: model /model')
    })
    const { startConstruct } = await import('./start-construct.js')
    vi.mocked(startConstruct).mock.lastCall?.[0].onWatchError?.(new Error('watch broke'))
    expect(exitCodes).toEqual([1])
    expect(close).not.toHaveBeenCalled()
    finish(construct())
    await loaded
  })

  it('prints the problem and exits with code 1 when the close fails', async () => {
    close.mockRejectedValue(new Error('close broke'))
    const loaded = load()
    await vi.waitFor(() => {
      expect(output).toContain('wishem: model /model')
    })
    finish(construct())
    await loaded
    handlers.get('SIGINT')?.()
    await vi.waitFor(() => {
      expect(exitCodes).toEqual([1])
    })
    expect(output.join('\n')).toContain('close broke')
  })
})
