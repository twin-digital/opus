import { describe, expect, it, vi } from 'vitest'

const stubs = vi.hoisted(() => ({
  attach: vi.fn(),
  close: vi.fn(),
}))

vi.mock('./product-construct.js', () => ({
  startProductConstruct: () =>
    Promise.resolve({
      id: 'play',
      linkUrl: 'ws://127.0.0.1:1/link',
      hub: { attach: stubs.attach },
      close: stubs.close,
    }),
}))

const { inProcessLauncher } = await import('./launchers.js')

const start = { id: 'play', model: { entities: [] } as never, running: true }

const makePort = () => ({ close: vi.fn() })

describe('inProcessLauncher', () => {
  it('gives the ID of this process to onProcess and to pid', async () => {
    stubs.attach.mockReset()
    stubs.close.mockReset().mockResolvedValue(undefined)
    stubs.attach.mockImplementation(() => makePort())
    const pids: number[] = []
    const launched = await inProcessLauncher()(start, { onProcess: (pid) => pids.push(pid) })
    expect(pids).toEqual([process.pid])
    expect(launched.pid).toBe(process.pid)
  })

  it('closes the construct and rejects when a port cannot attach', async () => {
    stubs.attach.mockReset()
    stubs.close.mockReset().mockResolvedValue(undefined)
    stubs.attach.mockImplementation(() => {
      throw new Error('The ID is in use.')
    })
    await expect(inProcessLauncher()(start)).rejects.toThrow('The ID is in use.')
    expect(stubs.close).toHaveBeenCalledTimes(1)
  })

  it('closes both ports and the construct one time, and gives the same promise', async () => {
    stubs.attach.mockReset()
    stubs.close.mockReset().mockResolvedValue(undefined)
    const ports = [makePort(), makePort()]
    stubs.attach.mockImplementationOnce(() => ports[0]).mockImplementationOnce(() => ports[1])
    const launched = await inProcessLauncher()(start)
    const first = launched.close()
    expect(launched.close()).toBe(first)
    await first
    expect(ports[0].close).toHaveBeenCalledTimes(1)
    expect(ports[1].close).toHaveBeenCalledTimes(1)
    expect(stubs.close).toHaveBeenCalledTimes(1)
  })
})
