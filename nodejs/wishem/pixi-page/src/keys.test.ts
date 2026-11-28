import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChannelPair, openLink, serveLink } from '@thrashplay/wishem-hub'
import type { JoinedState, Port, RemoteLink } from '@thrashplay/wishem-hub'
import type { ProductConstruct } from '@thrashplay/wishem-construct-manager/node'
import type { TimePart } from '@thrashplay/wishem-clock'
import { startSampleConstruct } from '../tests/sample-construct.js'
import { attachKeys, STEP_MS } from './keys.js'

const press = (target: EventTarget, key: string) => {
  const event = Object.assign(new Event('keydown', { cancelable: true }), { key })
  target.dispatchEvent(event)
  return event
}

const timeOf = (port: Port) => port.read().time as TimePart

describe('attachKeys', () => {
  const links: RemoteLink[] = []
  const constructs: ProductConstruct[] = []

  afterEach(async () => {
    links.splice(0).forEach((link) => {
      link.close()
    })
    await Promise.all(constructs.splice(0).map((construct) => construct.close()))
  })

  const setup = async (running = true) => {
    const { hub } = await startSampleConstruct({ paused: !running }).then((construct) => {
      constructs.push(construct)
      return construct
    })
    const [clientChannel, hubChannel] = createChannelPair()
    serveLink(hub, hubChannel)
    const link = await openLink(clientChannel, [
      { id: 'keys', kind: 'input' },
      { id: 'screen', kind: 'output' },
    ])
    links.push(link)
    return { hub, input: link.ports.keys, screen: link.ports.screen }
  }

  const applied = (port: Port) =>
    new Promise<void>((resolve) => {
      const off = port.subscribe((event) => {
        if (event.type === 'applied') {
          off()
          resolve()
        }
      })
    })

  it('sends time/set-running with false for the space key while running, and true after it', async () => {
    const { input, screen } = await setup(true)
    const target = new EventTarget()
    attachKeys(target, () => input)

    const first = applied(screen)
    press(target, ' ')
    await first
    expect(timeOf(screen).running).toBe(false)

    const second = applied(screen)
    press(target, ' ')
    await second
    expect(timeOf(screen).running).toBe(true)
  })

  it('sends time/advance of STEP_MS for the period key', async () => {
    const { input, screen, hub } = await setup(false)
    const target = new EventTarget()
    attachKeys(target, () => input)

    const done = applied(screen)
    press(target, '.')
    await done

    expect(timeOf(screen).ticks).toBe(1)
    expect(timeOf(screen).now).toBe(STEP_MS)
    expect(hub.record().at(-1)).toMatchObject({ type: 'time/advance', payload: { ms: STEP_MS } })
  })

  it('sends nothing for another key', () => {
    const submit = vi.fn()
    const target = new EventTarget()
    attachKeys(target, () => ({ read: () => ({ time: { running: true } }), submit }) as unknown as Port)
    press(target, 'a')
    press(target, 'Enter')
    expect(submit).not.toHaveBeenCalled()
  })

  it('calls preventDefault for the space key only', () => {
    const target = new EventTarget()
    attachKeys(target, () => undefined)
    expect(press(target, ' ').defaultPrevented).toBe(true)
    expect(press(target, '.').defaultPrevented).toBe(false)
    expect(press(target, 'a').defaultPrevented).toBe(false)
  })

  it('does nothing and throws no error when there is no port', () => {
    const target = new EventTarget()
    attachKeys(target, () => undefined)
    expect(() => {
      press(target, ' ')
      press(target, '.')
    }).not.toThrow()
  })

  it('sends nothing for the space key when the state has no part time', () => {
    const submit = vi.fn()
    const target = new EventTarget()
    const port = { read: (): JoinedState => ({}), submit } as unknown as Port
    attachKeys(target, () => port)
    press(target, ' ')
    expect(submit).not.toHaveBeenCalled()
  })

  it('ignores a rejected submit, and sends it no second time', async () => {
    const submit = vi.fn(() => Promise.resolve({ ok: false, reason: 'not-running', problems: [] }))
    const target = new EventTarget()
    attachKeys(target, () => ({ read: () => ({ time: { running: true } }), submit }) as unknown as Port)
    press(target, ' ')
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('ignores a submit that fails, with no unhandled rejection', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    const submit = vi.fn(() => Promise.reject(new Error('The link ended.')))
    const target = new EventTarget()
    attachKeys(target, () => ({ read: () => ({ time: { running: true } }), submit }) as unknown as Port)
    press(target, '.')
    await new Promise((resolve) => setTimeout(resolve, 10))
    process.off('unhandledRejection', unhandled)
    expect(submit).toHaveBeenCalledTimes(1)
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('ignores a submit that throws', () => {
    const submit = vi.fn(() => {
      throw new Error('The port is closed.')
    })
    const target = new EventTarget()
    attachKeys(target, () => ({ read: () => ({ time: { running: true } }), submit }) as unknown as Port)
    expect(() => press(target, '.')).not.toThrow()
  })

  it('reads the input port at each key', () => {
    const first = vi.fn(() => Promise.resolve({ ok: true, seq: 1 }))
    const second = vi.fn(() => Promise.resolve({ ok: true, seq: 1 }))
    let current = { read: () => ({ time: { running: true } }), submit: first }
    const target = new EventTarget()
    attachKeys(target, () => current as unknown as Port)
    press(target, '.')
    current = { read: current.read, submit: second }
    press(target, '.')
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('returns a function that removes the listener, and a second call does nothing', () => {
    const submit = vi.fn(() => Promise.resolve({ ok: true, seq: 1 }))
    const target = new EventTarget()
    const detach = attachKeys(target, () => ({ read: () => ({ time: { running: true } }), submit }) as unknown as Port)
    detach()
    expect(() => {
      detach()
    }).not.toThrow()
    press(target, '.')
    expect(submit).not.toHaveBeenCalled()
  })
})
