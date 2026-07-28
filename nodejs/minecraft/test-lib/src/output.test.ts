import type * as MC from '@minecraft/server'
import { describe, expect, it } from 'vitest'

import {
  createPlayer,
  createServer,
  getHandlerErrors,
  getOutput,
  invalidate,
  InvalidEntityError,
  NotImplementedError,
  type FakeServer,
} from './index.js'

/** The error a call threw, so a case can assert on its class and its fields. */
const thrownBy = (call: () => unknown): unknown => {
  try {
    call()
  } catch (error) {
    return error
  }
  throw new Error('expected the call to throw, and it did not')
}

/** Every enumerable member a fake exposes, own and inherited alike. */
const memberNames = (fake: object): string[] => {
  const names: string[] = []
  for (const name in fake) {
    names.push(name)
  }
  return names
}

/** A player to send to. */
const aPlayer = (server: FakeServer): MC.Player => createPlayer(server, { name: 'Ann' })

describe('getOutput', () => {
  it('is empty for a fresh world and a fresh player', () => {
    const server = createServer()
    expect(getOutput(server.world)).toEqual([])
    expect(getOutput(aPlayer(server))).toEqual([])
  })

  it('returns one interleaved log per target, in send order', () => {
    const server = createServer()
    const player = aPlayer(server)
    player.sendMessage('hi')
    player.onScreenDisplay.setTitle('t')
    player.onScreenDisplay.updateSubtitle('s')
    player.onScreenDisplay.setActionBar('a')
    expect(getOutput(player).map((record) => record.kind)).toEqual(['message', 'title', 'subtitle', 'actionBar'])
  })

  it("keeps two players' logs apart", () => {
    const server = createServer()
    const first = aPlayer(server)
    const second = aPlayer(server)
    first.sendMessage('for the first')
    expect(getOutput(second)).toEqual([])
  })

  it('returns a snapshot rather than a live view', () => {
    const server = createServer()
    const player = aPlayer(server)
    player.sendMessage('one')
    const held = getOutput(player)
    player.sendMessage('two')
    expect(held).toHaveLength(1)
    expect(getOutput(player)).toHaveLength(2)
  })

  it('keeps two bundles apart', () => {
    const a = createServer()
    const b = createServer()
    a.world.sendMessage('for a')
    expect(getOutput(b.world)).toEqual([])
  })
})

describe('sendMessage', () => {
  it('appends a message record for player.sendMessage', () => {
    const server = createServer()
    const player = aPlayer(server)
    player.sendMessage('hi')
    const log = getOutput(player)
    expect(log).toHaveLength(1)
    expect(log[0].kind).toBe('message')
    expect(log[0].value).toBe('hi')
    expect('options' in log[0]).toBe(false)
  })

  it('appends a message record for world.sendMessage', () => {
    const server = createServer()
    const player = aPlayer(server)
    server.world.sendMessage('all')
    expect(getOutput(server.world)).toEqual([{ kind: 'message', value: 'all' }])
    expect(getOutput(player)).toEqual([])
  })

  it('stores a RawMessage value as passed', () => {
    const server = createServer()
    const player = aPlayer(server)
    const raw: MC.RawMessage = { translate: 'a.b', with: ['x'] }
    player.sendMessage(raw)
    expect(getOutput(player)[0].value).toBe(raw)
  })

  it('stores an array of strings and RawMessages as passed', () => {
    const server = createServer()
    const player = aPlayer(server)
    const parts: (MC.RawMessage | string)[] = ['a', { translate: 'b' }]
    player.sendMessage(parts)
    expect(getOutput(player)[0].value).toBe(parts)
  })
})

describe('onScreenDisplay', () => {
  it('appends a title record from setTitle', () => {
    const server = createServer()
    const player = aPlayer(server)
    player.onScreenDisplay.setTitle('Chapter 1')
    const log = getOutput(player)
    expect(log[0].kind).toBe('title')
    expect(log[0].value).toBe('Chapter 1')
    expect('options' in log[0]).toBe(false)
  })

  it('carries the title options the call made', () => {
    const server = createServer()
    const player = aPlayer(server)
    const options: MC.TitleDisplayOptions = {
      fadeInDuration: 2,
      fadeOutDuration: 4,
      stayDuration: 100,
      subtitle: 'Trouble',
    }
    player.onScreenDisplay.setTitle('Chapter 1', options)
    const log = getOutput(player)
    expect(log).toHaveLength(1)
    expect(log[0].value).toBe('Chapter 1')
    expect(log[0].options).toBe(options)
  })

  it('appends a subtitle record from updateSubtitle', () => {
    const server = createServer()
    const player = aPlayer(server)
    player.onScreenDisplay.updateSubtitle('10')
    expect(getOutput(player)).toEqual([{ kind: 'subtitle', value: '10' }])
  })

  it('appends an actionBar record from setActionBar', () => {
    const server = createServer()
    const player = aPlayer(server)
    player.onScreenDisplay.setActionBar('go')
    expect(getOutput(player)).toEqual([{ kind: 'actionBar', value: 'go' }])
  })

  it('returns the same ScreenDisplay object on every read', () => {
    const player = aPlayer(createServer())
    expect(player.onScreenDisplay).toBe(player.onScreenDisplay)
  })
})

describe('output side effects', () => {
  it('displays nothing and raises no signal', () => {
    const server = createServer()
    const player = aPlayer(server)
    const delivered: string[] = []
    const signals = server.world.afterEvents as unknown as Record<
      string,
      { subscribe: (callback: () => void) => unknown }
    >
    for (const name of memberNames(server.world.afterEvents)) {
      signals[name].subscribe(() => {
        delivered.push(name)
      })
    }
    player.sendMessage('hi')
    server.world.sendMessage('all')
    player.onScreenDisplay.setTitle('t')
    player.onScreenDisplay.updateSubtitle('s')
    player.onScreenDisplay.setActionBar('a')
    expect(delivered).toEqual([])
    expect(getHandlerErrors(server)).toEqual([])
  })

  it('throws InvalidEntityError from every output member on an invalidated player', () => {
    const server = createServer()
    const player = aPlayer(server)
    const display = player.onScreenDisplay
    invalidate(player)
    expect(
      thrownBy(() => {
        player.sendMessage('hi')
      }),
    ).toBeInstanceOf(InvalidEntityError)
    expect(
      thrownBy(() => {
        display.setTitle('t')
      }),
    ).toBeInstanceOf(InvalidEntityError)
    expect(
      thrownBy(() => {
        display.updateSubtitle('s')
      }),
    ).toBeInstanceOf(InvalidEntityError)
    expect(
      thrownBy(() => {
        display.setActionBar('a')
      }),
    ).toBeInstanceOf(InvalidEntityError)
  })

  it('throws NotImplementedError from the unmodelled ScreenDisplay members', () => {
    const display = aPlayer(createServer()).onScreenDisplay
    expect(thrownBy(() => display.getHiddenHudElements())).toBeInstanceOf(NotImplementedError)
    expect(
      thrownBy(() => {
        display.hideAllExcept([])
      }),
    ).toBeInstanceOf(NotImplementedError)
    expect(thrownBy(() => display.isForcedHidden(6))).toBeInstanceOf(NotImplementedError)
    expect(
      thrownBy(() => {
        display.resetHudElementsVisibility()
      }),
    ).toBeInstanceOf(NotImplementedError)
    expect(
      thrownBy(() => {
        display.setHudVisibility(0)
      }),
    ).toBeInstanceOf(NotImplementedError)
  })

  it('reports arity ahead of the guard on an output member', () => {
    const server = createServer()
    const player = aPlayer(server)
    invalidate(player)
    const bare = player as unknown as Record<string, () => unknown>
    expect(() => bare.sendMessage()).toThrow(
      new TypeError('Incorrect number of arguments to function. Expected 1, received 0'),
    )
  })

  it('accepts extra arguments to an output member', () => {
    const server = createServer()
    const player = aPlayer(server)
    const bare = player as unknown as Record<string, (...args: unknown[]) => unknown>
    expect(() => bare.sendMessage('hi', 'extra')).not.toThrow()
    expect(getOutput(player)).toEqual([{ kind: 'message', value: 'hi' }])
  })
})
