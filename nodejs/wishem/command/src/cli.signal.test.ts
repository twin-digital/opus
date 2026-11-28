import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProductCodeCheck } from '@thrashplay/wishem-construct-manager/node'
import type { Construct } from '@thrashplay/wishem-host-nodejs'

vi.mock('@thrashplay/wishem-host-nodejs', () => ({
  DEFAULT_PORT: 4747,
  PRODUCT_ID: 'product',
  startConstruct: vi.fn(),
}))
vi.mock('@thrashplay/wishem-construct-manager', () => ({ createConstructList: vi.fn(() => ({ id: 'constructs' })) }))
vi.mock('@thrashplay/wishem-construct-manager/node', () => ({
  attachConstructManager: vi.fn(),
  checkProductCode: vi.fn(),
  childProcessLauncher: vi.fn(() => 'launcher'),
}))

type Handler = () => void

describe('the stop signal during the start of the wishem command', () => {
  let handlers: Map<string, Handler>
  let output: string[]
  let exitCodes: (number | undefined)[]
  let close: ReturnType<typeof vi.fn<() => Promise<void>>>
  let finish: (construct: Construct) => void
  let fail: (error: Error) => void
  const argv = process.argv

  const load = async (extra: string[] = []) => {
    const { startConstruct } = await import('@thrashplay/wishem-host-nodejs')
    vi.mocked(startConstruct).mockReturnValue(
      new Promise<Construct>((resolve, reject) => {
        finish = resolve
        fail = reject
      }),
    )
    process.argv = ['node', 'cli.js', 'start', '/model', '--port', '0', ...extra]
    return import('./cli.js')
  }

  const construct = () =>
    ({
      linkUrl: 'ws://127.0.0.1:1/link',
      hub: {
        read: () => ({ store: { definitions: [], entities: [] }, product: { definitions: [], entities: [] } }),
      },
      close,
    }) as unknown as Construct

  beforeEach(() => {
    vi.resetModules()
    handlers = new Map()
    output = []
    exitCodes = []
    close = vi.fn<() => Promise<void>>(() => Promise.resolve())
    vi.spyOn(process, 'on').mockImplementation(((event: string, handler: Handler) => {
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
    const { startConstruct } = await import('@thrashplay/wishem-host-nodejs')
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
    const { startConstruct } = await import('@thrashplay/wishem-host-nodejs')
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

  describe('with a product', () => {
    let calls: string[]
    let managerClose: ReturnType<typeof vi.fn<() => Promise<void>>>

    const attached = async () => {
      const { attachConstructManager } = await import('@thrashplay/wishem-construct-manager/node')
      return vi.mocked(attachConstructManager)
    }

    beforeEach(async () => {
      calls = []
      managerClose = vi.fn<() => Promise<void>>(() => {
        calls.push('manager')
        return Promise.resolve()
      })
      close.mockImplementation(() => {
        calls.push('construct')
        return Promise.resolve()
      })
      vi.mocked(await attached()).mockClear()
      vi.mocked(await attached()).mockReturnValue({ running: new Map(), close: managerClose })
    })

    it('attaches the manager with the construct list and the child process launcher', async () => {
      const loaded = load(['--product', '/product'])
      await vi.waitFor(() => {
        expect(output).toContain('wishem: product /product')
      })
      finish(construct())
      await loaded
      const { startConstruct } = await import('@thrashplay/wishem-host-nodejs')
      expect(vi.mocked(startConstruct).mock.lastCall?.[0].subsystems).toEqual([{ id: 'constructs' }])
      const options = (await attached()).mock.lastCall?.[0]
      expect(options?.launch).toBe('launcher')
      expect(options?.log).toBeTypeOf('function')
    })

    it('exits with code 0 and starts no construct after a stop signal during the check of the product code', async () => {
      const { checkProductCode } = await import('@thrashplay/wishem-construct-manager/node')
      let endCheck: (result: ProductCodeCheck) => void = () => undefined
      vi.mocked(checkProductCode).mockReturnValue(
        new Promise((resolve) => {
          endCheck = resolve
        }),
      )
      const { startConstruct } = await import('@thrashplay/wishem-host-nodejs')
      vi.mocked(startConstruct).mockClear()
      const loaded = load(['--product', '/product', '--product-code', '/code.mjs'])
      await vi.waitFor(() => {
        expect(vi.mocked(checkProductCode)).toHaveBeenCalled()
      })
      expect(handlers.get('SIGINT')).toBeDefined()
      expect(handlers.get('SIGTERM')).toBeDefined()
      handlers.get('SIGINT')?.()
      endCheck({ ok: true, count: 1 })
      await loaded
      expect(exitCodes).toEqual([0])
      expect(startConstruct).not.toHaveBeenCalled()
    })

    it('exits with code 0 after a stop signal during a check that does not end', async () => {
      const { checkProductCode } = await import('@thrashplay/wishem-construct-manager/node')
      let endCheck: (result: ProductCodeCheck) => void = () => undefined
      vi.mocked(checkProductCode).mockReturnValue(
        new Promise((resolve) => {
          endCheck = resolve
        }),
      )
      const { startConstruct } = await import('@thrashplay/wishem-host-nodejs')
      vi.mocked(startConstruct).mockClear()
      vi.mocked(checkProductCode).mockClear()
      const loaded = load(['--product', '/product', '--product-code', '/code.mjs'])
      await vi.waitFor(() => {
        expect(vi.mocked(checkProductCode)).toHaveBeenCalled()
      })
      handlers.get('SIGINT')?.()
      endCheck({ ok: false, reason: 'load', message: 'The check did not end in 5 seconds.' })
      await loaded
      expect(exitCodes).toEqual([0])
      expect(startConstruct).not.toHaveBeenCalled()
    })

    it('attaches no manager when a stop signal comes before the start ends', async () => {
      const loaded = load(['--product', '/product'])
      await vi.waitFor(() => {
        expect(handlers.get('SIGINT')).toBeDefined()
      })
      handlers.get('SIGINT')?.()
      finish(construct())
      await loaded
      await vi.waitFor(() => {
        expect(exitCodes).toEqual([0])
      })
      expect(await attached()).not.toHaveBeenCalled()
      expect(calls).toEqual(['construct'])
    })

    it.each(['SIGINT', 'SIGTERM'])('closes the manager before the construct after %s', async (signal) => {
      const loaded = load(['--product', '/product'])
      await vi.waitFor(() => {
        expect(output).toContain('wishem: product /product')
      })
      finish(construct())
      await loaded
      handlers.get(signal)?.()
      await vi.waitFor(() => {
        expect(exitCodes).toEqual([0])
      })
      expect(calls).toEqual(['manager', 'construct'])
    })

    it('starts the close of the construct only after the close of the manager ends', async () => {
      let endManagerClose: () => void = () => undefined
      managerClose.mockImplementation(() => {
        calls.push('manager')
        return new Promise<void>((resolve) => {
          endManagerClose = resolve
        })
      })
      const loaded = load(['--product', '/product'])
      await vi.waitFor(() => {
        expect(output).toContain('wishem: product /product')
      })
      finish(construct())
      await loaded
      handlers.get('SIGINT')?.()
      await vi.waitFor(() => {
        expect(calls).toEqual(['manager'])
      })
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(calls).toEqual(['manager'])
      expect(exitCodes).toEqual([])
      endManagerClose()
      await vi.waitFor(() => {
        expect(exitCodes).toEqual([0])
      })
      expect(calls).toEqual(['manager', 'construct'])
    })

    it('closes the manager before the construct and exits with code 1 after a watch error', async () => {
      const loaded = load(['--product', '/product'])
      await vi.waitFor(() => {
        expect(output).toContain('wishem: product /product')
      })
      finish(construct())
      await loaded
      const { startConstruct } = await import('@thrashplay/wishem-host-nodejs')
      vi.mocked(startConstruct).mock.lastCall?.[0].onWatchError?.(new Error('watch broke'))
      await vi.waitFor(() => {
        expect(exitCodes).toEqual([1])
      })
      expect(calls).toEqual(['manager', 'construct'])
    })

    it('closes the construct and exits with code 1 when the manager does not close', async () => {
      managerClose.mockImplementation(() => {
        calls.push('manager')
        return Promise.reject(new Error('manager broke'))
      })
      const loaded = load(['--product', '/product'])
      await vi.waitFor(() => {
        expect(output).toContain('wishem: product /product')
      })
      finish(construct())
      await loaded
      handlers.get('SIGINT')?.()
      await vi.waitFor(() => {
        expect(exitCodes).toEqual([1])
      })
      expect(calls).toEqual(['manager', 'construct'])
      expect(output.join('\n')).toContain('manager broke')
    })

    it('closes the construct and reports the error when the attach fails', async () => {
      vi.mocked(await attached()).mockImplementation(() => {
        throw new Error('attach broke')
      })
      const loaded = load(['--product', '/product'])
      await vi.waitFor(() => {
        expect(output).toContain('wishem: product /product')
      })
      finish(construct())
      await loaded
      await vi.waitFor(() => {
        expect(exitCodes).toEqual([1])
      })
      expect(calls).toEqual(['construct'])
      expect(output).toContain('wishem: attach broke')
    })

    it('attaches no manager without a product', async () => {
      const loaded = load()
      await vi.waitFor(() => {
        expect(output).toContain('wishem: model /model')
      })
      finish(construct())
      await loaded
      expect(await attached()).not.toHaveBeenCalled()
      const { startConstruct } = await import('@thrashplay/wishem-host-nodejs')
      expect(vi.mocked(startConstruct).mock.lastCall?.[0].subsystems).toBeUndefined()
    })
  })
})
