import type * as MC from '@minecraft/server'
import { describe, expect, it } from 'vitest'

import { dispatchAfter } from './events.js'
import {
  addComponent,
  advanceTicks,
  createEntity,
  createServer,
  emit,
  getHandlerErrors,
  NotImplementedError,
  withVanillaDimensions,
  type FakeServer,
} from './index.js'
import { serverOf } from './runtime/state.js'

/** The 55 after-event signals the declarations carry, written out so the check is independent. */
const WORLD_AFTER_EVENT_NAMES = [
  'blockContainerClosed',
  'blockContainerOpened',
  'blockExplode',
  'buttonPush',
  'dataDrivenEntityTrigger',
  'effectAdd',
  'entityContainerClosed',
  'entityContainerOpened',
  'entityDie',
  'entityHeal',
  'entityHealthChanged',
  'entityHitBlock',
  'entityHitEntity',
  'entityHurt',
  'entityItemDrop',
  'entityItemPickup',
  'entityLoad',
  'entityRemove',
  'entitySpawn',
  'entityUpgrade',
  'explosion',
  'gameRuleChange',
  'itemCompleteUse',
  'itemReleaseUse',
  'itemStartUse',
  'itemStartUseOn',
  'itemStopUse',
  'itemStopUseOn',
  'itemUse',
  'leverAction',
  'pistonActivate',
  'playerBreakBlock',
  'playerButtonInput',
  'playerDimensionChange',
  'playerEmote',
  'playerGameModeChange',
  'playerHotbarSelectedSlotChange',
  'playerInputModeChange',
  'playerInputPermissionCategoryChange',
  'playerInteractWithBlock',
  'playerInteractWithEntity',
  'playerInventoryItemChange',
  'playerJoin',
  'playerLeave',
  'playerPlaceBlock',
  'playerSpawn',
  'playerSwingStart',
  'pressurePlatePop',
  'pressurePlatePush',
  'projectileHitBlock',
  'projectileHitEntity',
  'targetBlockHit',
  'tripWireTrip',
  'weatherChange',
  'worldLoad',
]

/** The 13 before-event signals, likewise written out. */
const WORLD_BEFORE_EVENT_NAMES = [
  'effectAdd',
  'entityHeal',
  'entityHurt',
  'entityItemPickup',
  'entityRemove',
  'explosion',
  'itemUse',
  'playerBreakBlock',
  'playerGameModeChange',
  'playerInteractWithBlock',
  'playerInteractWithEntity',
  'playerLeave',
  'weatherChange',
]

/** Every enumerable member a fake exposes, own and inherited alike — the engine's own shape. */
const memberNames = (fake: object): string[] => {
  const names: string[] = []
  for (const name in fake) {
    names.push(name)
  }
  return names.sort()
}

/** A signal as `emit` and the subscription cases need it, without naming 68 signal classes. */
interface AnySignal {
  subscribe: (callback: (payload: never) => void) => unknown
  unsubscribe: (callback: (payload: never) => void) => void
}

/** One named signal off a container, reached by name. */
const signalNamed = (container: object, name: string): AnySignal => (container as Record<string, AnySignal>)[name]

/** A payload literal for a signal a test drives; fields the case never reads stay unsupplied. */
const payload = <T>(fields: Partial<T>): T => fields as T

/** The error a call threw, so a case can assert on its class and its fields. */
const thrownBy = (call: () => unknown): unknown => {
  try {
    call()
  } catch (error) {
    return error
  }
  throw new Error('expected the call to throw, and it did not')
}

/** Subscribes one handler to every signal a container carries, recording which one delivered. */
const watchAll = (container: object, delivered: string[], prefix: string): void => {
  for (const name of memberNames(container)) {
    signalNamed(container, name).subscribe(() => {
      delivered.push(`${prefix}.${name}`)
    })
  }
}

/** An entity carrying a health component: the setup every damage-cascade case shares. */
const hurtable = (server: FakeServer, health = 8): MC.Entity => {
  const entity = createEntity(server, { typeId: 'minecraft:sheep' })
  addComponent(entity, 'minecraft:health', health)
  return entity
}

/** The health an entity currently holds. */
const healthOf = (entity: MC.Entity): number | undefined => entity.getComponent('minecraft:health')?.currentValue

describe('signal existence', () => {
  it('exposes 55 after-event signals on world.afterEvents', () => {
    const { world } = createServer()
    expect(memberNames(world.afterEvents)).toEqual([...WORLD_AFTER_EVENT_NAMES].sort())
    expect(WORLD_AFTER_EVENT_NAMES).toHaveLength(55)
    for (const name of WORLD_AFTER_EVENT_NAMES) {
      const signal = signalNamed(world.afterEvents, name)
      expect(typeof signal.subscribe).toBe('function')
      expect(typeof signal.unsubscribe).toBe('function')
    }
  })

  it('exposes 13 before-event signals on world.beforeEvents', () => {
    const { world } = createServer()
    expect(memberNames(world.beforeEvents)).toEqual([...WORLD_BEFORE_EVENT_NAMES].sort())
    expect(WORLD_BEFORE_EVENT_NAMES).toHaveLength(13)
    for (const name of WORLD_BEFORE_EVENT_NAMES) {
      const signal = signalNamed(world.beforeEvents, name)
      expect(typeof signal.subscribe).toBe('function')
      expect(typeof signal.unsubscribe).toBe('function')
    }
  })

  it('exposes system.afterEvents.scriptEventReceive and system.beforeEvents.shutdown and startup', () => {
    const { system } = createServer()
    expect(memberNames(system.afterEvents)).toEqual(['scriptEventReceive'])
    expect(memberNames(system.beforeEvents)).toEqual(['shutdown', 'startup'])
    expect(typeof system.afterEvents.scriptEventReceive.subscribe).toBe('function')
    expect(typeof system.beforeEvents.startup.unsubscribe).toBe('function')
  })

  it('returns the same signal object on every read', () => {
    const { world, system } = createServer()
    expect(world.afterEvents.entityHurt).toBe(world.afterEvents.entityHurt)
    expect(world.beforeEvents.entityHurt).toBe(world.beforeEvents.entityHurt)
    expect(system.afterEvents.scriptEventReceive).toBe(system.afterEvents.scriptEventReceive)
  })

  it('gives each container its own signal objects', () => {
    const { world } = createServer()
    expect(world.afterEvents.effectAdd).not.toBe(world.beforeEvents.effectAdd)
  })
})

describe('subscription', () => {
  it('returns the callback it was given', () => {
    const { world } = createServer()
    const handler = (): void => undefined
    expect(world.afterEvents.entityHurt.subscribe(handler)).toBe(handler)
  })

  it('delivers one call when the same function reference is subscribed twice', () => {
    const { world } = createServer()
    let calls = 0
    const handler = (): void => {
      calls += 1
    }
    world.afterEvents.entityHurt.subscribe(handler)
    world.afterEvents.entityHurt.subscribe(handler)
    emit(world.afterEvents.entityHurt, payload<MC.EntityHurtAfterEvent>({ damage: 1 }))
    expect(calls).toBe(1)
  })

  it('runs distinct subscribers in subscription order', () => {
    const { world } = createServer()
    const order: string[] = []
    world.afterEvents.entityHurt.subscribe(() => {
      order.push('first')
    })
    world.afterEvents.entityHurt.subscribe(() => {
      order.push('second')
    })
    emit(world.afterEvents.entityHurt, payload<MC.EntityHurtAfterEvent>({ damage: 1 }))
    expect(order).toEqual(['first', 'second'])
  })

  it('stops delivering to an unsubscribed handler', () => {
    const { world } = createServer()
    const order: string[] = []
    const a = (): void => {
      order.push('a')
    }
    const b = (): void => {
      order.push('b')
    }
    world.afterEvents.entityHurt.subscribe(a)
    world.afterEvents.entityHurt.subscribe(b)
    world.afterEvents.entityHurt.unsubscribe(a)
    emit(world.afterEvents.entityHurt, payload<MC.EntityHurtAfterEvent>({ damage: 1 }))
    expect(order).toEqual(['b'])
  })

  it('ignores an unsubscribe of a function that was never subscribed', () => {
    const { world } = createServer()
    const order: string[] = []
    world.afterEvents.entityHurt.subscribe(() => {
      order.push('subscribed')
    })
    expect(() => {
      world.afterEvents.entityHurt.unsubscribe(() => undefined)
    }).not.toThrow()
    emit(world.afterEvents.entityHurt, payload<MC.EntityHurtAfterEvent>({ damage: 1 }))
    expect(order).toEqual(['subscribed'])
  })

  it('places a re-subscribed handler at the end of the order', () => {
    const { world } = createServer()
    const order: string[] = []
    const a = (): void => {
      order.push('a')
    }
    const b = (): void => {
      order.push('b')
    }
    world.afterEvents.entityHurt.subscribe(a)
    world.afterEvents.entityHurt.subscribe(b)
    world.afterEvents.entityHurt.unsubscribe(a)
    world.afterEvents.entityHurt.subscribe(a)
    emit(world.afterEvents.entityHurt, payload<MC.EntityHurtAfterEvent>({ damage: 1 }))
    expect(order).toEqual(['b', 'a'])
  })

  it('throws NotImplementedError for a filtered subscribe', () => {
    const { world } = createServer()
    let calls = 0
    const error = thrownBy(() =>
      world.afterEvents.entityHurt.subscribe(
        () => {
          calls += 1
        },
        { entityTypes: ['minecraft:sheep'] },
      ),
    )
    expect(error).toBeInstanceOf(NotImplementedError)
    expect((error as NotImplementedError).member).toBe('EntityHurtAfterEventSignal.subscribe')
    emit(world.afterEvents.entityHurt, payload<MC.EntityHurtAfterEvent>({ damage: 1 }))
    expect(calls).toBe(0)
  })

  it('does not deliver to a handler subscribed during the dispatch that is running', () => {
    const { world } = createServer()
    let lateCalls = 0
    const late = (): void => {
      lateCalls += 1
    }
    world.afterEvents.entityHurt.subscribe(() => {
      world.afterEvents.entityHurt.subscribe(late)
    })
    emit(world.afterEvents.entityHurt, payload<MC.EntityHurtAfterEvent>({ damage: 1 }))
    expect(lateCalls).toBe(0)
    emit(world.afterEvents.entityHurt, payload<MC.EntityHurtAfterEvent>({ damage: 1 }))
    expect(lateCalls).toBe(1)
  })

  it('still delivers to a handler unsubscribed by an earlier handler in the same dispatch', () => {
    const { world } = createServer()
    let bCalls = 0
    const b = (): void => {
      bCalls += 1
    }
    world.afterEvents.entityHurt.subscribe(() => {
      world.afterEvents.entityHurt.unsubscribe(b)
    })
    world.afterEvents.entityHurt.subscribe(b)
    emit(world.afterEvents.entityHurt, payload<MC.EntityHurtAfterEvent>({ damage: 1 }))
    expect(bCalls).toBe(1)
    emit(world.afterEvents.entityHurt, payload<MC.EntityHurtAfterEvent>({ damage: 1 }))
    expect(bCalls).toBe(1)
  })
})

describe('emit', () => {
  it('delivers the payload object as given', () => {
    const { world } = createServer()
    const sent = payload<MC.EntityHurtAfterEvent>({ damage: 7 })
    let received: MC.EntityHurtAfterEvent | undefined
    world.afterEvents.entityHurt.subscribe((event) => {
      received = event
    })
    emit(world.afterEvents.entityHurt, sent)
    expect(received).toBe(sent)
    expect(Object.keys(sent)).toEqual(['damage'])
  })

  it('does nothing on a signal with no subscribers', () => {
    const server = createServer()
    expect(() => {
      emit(server.world.afterEvents.playerJoin, payload<MC.PlayerJoinAfterEvent>({ playerId: '1' }))
    }).not.toThrow()
    expect(getHandlerErrors(server)).toEqual([])
  })

  it('drives a before-event signal and a system signal too', () => {
    const { world, system } = createServer()
    const delivered: string[] = []
    world.beforeEvents.weatherChange.subscribe(() => {
      delivered.push('weatherChange')
    })
    system.afterEvents.scriptEventReceive.subscribe(() => {
      delivered.push('scriptEventReceive')
    })
    emit(world.beforeEvents.weatherChange, payload<MC.WeatherChangeBeforeEvent>({ duration: 10 }))
    emit(system.afterEvents.scriptEventReceive, payload<MC.ScriptEventCommandMessageAfterEvent>({ id: 'a:b' }))
    expect(delivered).toEqual(['weatherChange', 'scriptEventReceive'])
  })

  it('delivers to every subscriber before it returns', () => {
    const { world } = createServer()
    const order: string[] = []
    world.afterEvents.entityHurt.subscribe(() => {
      order.push('handler')
    })
    order.push('emit-called')
    emit(world.afterEvents.entityHurt, payload<MC.EntityHurtAfterEvent>({ damage: 1 }))
    order.push('emit-returned')
    expect(order).toEqual(['emit-called', 'handler', 'emit-returned'])
  })
})

describe('dispatch timing', () => {
  it('runs after-event handlers inside the call that caused them, before it returns', () => {
    const server = createServer()
    const entity = hurtable(server)
    const order: string[] = []
    server.world.afterEvents.entityHurt.subscribe(() => {
      order.push('handler')
    })
    order.push('call')
    entity.applyDamage(1)
    order.push('returned')
    expect(order).toEqual(['call', 'handler', 'returned'])
  })

  it('needs no tick advance to deliver an after-event', () => {
    const server = createServer()
    const entity = hurtable(server)
    let calls = 0
    server.world.afterEvents.entityHurt.subscribe(() => {
      calls += 1
    })
    entity.applyDamage(1)
    expect(calls).toBe(1)
    expect(server.system.currentTick).toBe(0)
  })

  it('shows handlers post-write state', () => {
    const server = createServer()
    const entity = hurtable(server)
    let observed: number | undefined
    server.world.afterEvents.entityHurt.subscribe(() => {
      observed = healthOf(entity)
    })
    entity.applyDamage(3)
    expect(observed).toBe(5)
  })
})

describe('a throwing handler', () => {
  it('does not reach the call that caused the event', () => {
    const server = createServer()
    const entity = hurtable(server)
    server.world.afterEvents.entityHurt.subscribe(() => {
      throw new Error('deliberate')
    })
    expect(entity.applyDamage(100)).toBe(true)
  })

  it('does not stop the other subscribers, thrower first', () => {
    const { world } = createServer()
    let witnessCalls = 0
    world.afterEvents.entityHurt.subscribe(() => {
      throw new Error('deliberate')
    })
    world.afterEvents.entityHurt.subscribe(() => {
      witnessCalls += 1
    })
    emit(world.afterEvents.entityHurt, payload<MC.EntityHurtAfterEvent>({ damage: 1 }))
    expect(witnessCalls).toBe(1)
  })

  it('does not stop the other subscribers, thrower last', () => {
    const { world } = createServer()
    let witnessCalls = 0
    world.afterEvents.entityHurt.subscribe(() => {
      witnessCalls += 1
    })
    world.afterEvents.entityHurt.subscribe(() => {
      throw new Error('deliberate')
    })
    expect(() => {
      emit(world.afterEvents.entityHurt, payload<MC.EntityHurtAfterEvent>({ damage: 1 }))
    }).not.toThrow()
    expect(witnessCalls).toBe(1)
  })

  it('does not stop the rest of the cascade', () => {
    const server = createServer()
    const entity = hurtable(server)
    const cascade: string[] = []
    server.world.afterEvents.entityHurt.subscribe(() => {
      cascade.push('entityHurt')
      throw new Error('deliberate')
    })
    server.world.afterEvents.entityHealthChanged.subscribe(() => {
      cascade.push('entityHealthChanged')
    })
    server.world.afterEvents.entityDie.subscribe(() => {
      cascade.push('entityDie')
    })
    entity.applyDamage(100)
    expect(cascade).toEqual(['entityHurt', 'entityHealthChanged', 'entityDie'])
  })
})

describe('getHandlerErrors', () => {
  it('is empty on a bundle whose handlers have not thrown', () => {
    const server = createServer()
    server.world.afterEvents.entityHurt.subscribe(() => undefined)
    emit(server.world.afterEvents.entityHurt, payload<MC.EntityHurtAfterEvent>({ damage: 1 }))
    expect(getHandlerErrors(server)).toEqual([])
  })

  it('records the error itself and the signal it was thrown on', () => {
    const server = createServer()
    const thrown = new Error('deliberate')
    server.world.afterEvents.entityHurt.subscribe(() => {
      throw thrown
    })
    emit(server.world.afterEvents.entityHurt, payload<MC.EntityHurtAfterEvent>({ damage: 1 }))
    const errors = getHandlerErrors(server)
    expect(errors).toHaveLength(1)
    expect(errors[0].signal).toBe('world.afterEvents.entityHurt')
    expect(errors[0].error).toBe(thrown)
    expect(Object.keys(errors[0]).sort()).toEqual(['error', 'signal'])
  })

  it('names a before-event and a system signal in the same scheme', () => {
    const server = createServer()
    server.world.beforeEvents.entityHurt.subscribe(() => {
      throw new Error('deliberate')
    })
    server.system.afterEvents.scriptEventReceive.subscribe(() => {
      throw new Error('deliberate')
    })
    emit(server.world.beforeEvents.entityHurt, payload<MC.EntityHurtBeforeEvent>({ damage: 1 }))
    emit(server.system.afterEvents.scriptEventReceive, payload<MC.ScriptEventCommandMessageAfterEvent>({ id: 'a:b' }))
    expect(getHandlerErrors(server).map((record) => record.signal)).toEqual([
      'world.beforeEvents.entityHurt',
      'system.afterEvents.scriptEventReceive',
    ])
  })

  it('returns errors in the order they were thrown', () => {
    const server = createServer()
    const first = new Error('first')
    const second = new Error('second')
    server.world.afterEvents.entityHurt.subscribe(() => {
      throw first
    })
    server.world.afterEvents.entityHurt.subscribe(() => {
      throw second
    })
    emit(server.world.afterEvents.entityHurt, payload<MC.EntityHurtAfterEvent>({ damage: 1 }))
    expect(getHandlerErrors(server).map((record) => record.error)).toEqual([first, second])
  })

  it('accumulates across dispatches and across signals', () => {
    const server = createServer()
    server.world.afterEvents.entityHurt.subscribe(() => {
      throw new Error('hurt')
    })
    server.world.afterEvents.entitySpawn.subscribe(() => {
      throw new Error('spawn')
    })
    emit(server.world.afterEvents.entityHurt, payload<MC.EntityHurtAfterEvent>({ damage: 1 }))
    emit(server.world.afterEvents.entitySpawn, payload<MC.EntitySpawnAfterEvent>({}))
    expect(getHandlerErrors(server).map((record) => record.signal)).toEqual([
      'world.afterEvents.entityHurt',
      'world.afterEvents.entitySpawn',
    ])
  })

  it('returns a snapshot rather than the live record', () => {
    const server = createServer()
    server.world.afterEvents.entityHurt.subscribe(() => {
      throw new Error('deliberate')
    })
    emit(server.world.afterEvents.entityHurt, payload<MC.EntityHurtAfterEvent>({ damage: 1 }))
    const held = getHandlerErrors(server)
    emit(server.world.afterEvents.entityHurt, payload<MC.EntityHurtAfterEvent>({ damage: 1 }))
    expect(held).toHaveLength(1)
    expect(getHandlerErrors(server)).toHaveLength(2)
  })

  it('records a non-Error throw as given', () => {
    const server = createServer()
    server.world.afterEvents.entityHurt.subscribe(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- a pack may throw anything
      throw 'boom'
    })
    emit(server.world.afterEvents.entityHurt, payload<MC.EntityHurtAfterEvent>({ damage: 1 }))
    expect(getHandlerErrors(server)[0].error).toBe('boom')
  })
})

describe('before-event cancellation', () => {
  it('stops applyDamage when a handler sets entityHurt.cancel', () => {
    const server = createServer()
    const entity = hurtable(server)
    const after: string[] = []
    server.world.beforeEvents.entityHurt.subscribe((event) => {
      event.cancel = true
    })
    watchAll(server.world.afterEvents, after, 'after')
    expect(entity.applyDamage(4)).toBe(true)
    expect(healthOf(entity)).toBe(8)
    expect(after).toEqual([])
  })

  it('stops addEffect when a handler sets effectAdd.cancel', () => {
    const server = createServer()
    const entity = createEntity(server, { typeId: 'minecraft:sheep' })
    const after: string[] = []
    server.world.beforeEvents.effectAdd.subscribe((event) => {
      event.cancel = true
    })
    watchAll(server.world.afterEvents, after, 'after')
    expect(entity.addEffect('minecraft:speed', 100)).toBeUndefined()
    expect(entity.getEffect('minecraft:speed')).toBeUndefined()
    expect(after).toEqual([])
  })

  it('proceeds when a handler leaves cancel alone or writes false', () => {
    const server = createServer()
    const entity = hurtable(server)
    server.world.beforeEvents.entityHurt.subscribe((event) => {
      event.cancel = false
    })
    expect(entity.applyDamage(3)).toBe(true)
    expect(healthOf(entity)).toBe(5)
  })

  it('proceeds when one handler cancels false after another cancelled true', () => {
    const server = createServer()
    const entity = hurtable(server)
    server.world.beforeEvents.entityHurt.subscribe((event) => {
      event.cancel = true
    })
    server.world.beforeEvents.entityHurt.subscribe((event) => {
      event.cancel = false
    })
    entity.applyDamage(3)
    expect(healthOf(entity)).toBe(5)
  })

  it('gives entityRemove no cancel field to write', () => {
    const server = createServer()
    const entity = createEntity(server, { typeId: 'minecraft:sheep' })
    const id = entity.id
    let sawCancel = true
    server.world.beforeEvents.entityRemove.subscribe((event) => {
      sawCancel = 'cancel' in event
      ;(event as unknown as { cancel: boolean }).cancel = true
    })
    let removedAfter = 0
    server.world.afterEvents.entityRemove.subscribe(() => {
      removedAfter += 1
    })
    entity.remove()
    expect(sawCancel).toBe(false)
    expect(removedAfter).toBe(1)
    expect(server.world.getEntity(id)).toBeUndefined()
  })
})

describe('before-event payload writes', () => {
  it('lowers the damage taken and the damage the after-event reports', () => {
    const server = createServer()
    const entity = hurtable(server)
    server.world.beforeEvents.entityHurt.subscribe((event) => {
      event.damage = 2
    })
    let reported: number | undefined
    server.world.afterEvents.entityHurt.subscribe((event) => {
      reported = event.damage
    })
    entity.applyDamage(10)
    expect(healthOf(entity)).toBe(6)
    expect(reported).toBe(2)
  })

  it('raises the damage taken', () => {
    const server = createServer()
    const entity = hurtable(server)
    server.world.beforeEvents.entityHurt.subscribe((event) => {
      event.damage = 4
    })
    entity.applyDamage(1)
    expect(healthOf(entity)).toBe(4)
  })

  it('still returns true from applyDamage when the handler writes damage to 0', () => {
    const server = createServer()
    const entity = hurtable(server)
    server.world.beforeEvents.entityHurt.subscribe((event) => {
      event.damage = 0
    })
    expect(entity.applyDamage(5)).toBe(true)
    expect(healthOf(entity)).toBe(8)
  })

  it('gives the resulting effect the duration the handler wrote', () => {
    const server = createServer()
    const entity = createEntity(server, { typeId: 'minecraft:sheep' })
    server.world.beforeEvents.effectAdd.subscribe((event) => {
      event.duration = 600
    })
    expect(entity.addEffect('minecraft:speed', 100)?.duration).toBe(600)
    expect(entity.getEffect('minecraft:speed')?.duration).toBe(600)
    // Decay runs from the duration the handler wrote, not the one the call requested.
    advanceTicks(server, 5)
    expect(entity.getEffect('minecraft:speed')?.duration).toBe(595)
  })

  it('shortens a duration the same way', () => {
    const server = createServer()
    const entity = createEntity(server, { typeId: 'minecraft:sheep' })
    server.world.beforeEvents.effectAdd.subscribe((event) => {
      event.duration = 100
    })
    entity.addEffect('minecraft:speed', 400)
    expect(entity.getEffect('minecraft:speed')?.duration).toBe(100)
  })

  it('leaves the other four mutable fields writable and unread', () => {
    const { world } = createServer()

    const heal = payload<MC.EntityHealBeforeEvent>({ healing: 1 })
    world.beforeEvents.entityHeal.subscribe((event) => {
      event.healing = 9
    })
    emit(world.beforeEvents.entityHeal, heal)
    expect(heal.healing).toBe(9)

    const stack = {} as MC.ItemStack
    const breakBlock = payload<MC.PlayerBreakBlockBeforeEvent>({})
    world.beforeEvents.playerBreakBlock.subscribe((event) => {
      event.itemStack = stack
    })
    emit(world.beforeEvents.playerBreakBlock, breakBlock)
    expect(breakBlock.itemStack).toBe(stack)

    const gameMode = payload<MC.PlayerGameModeChangeBeforeEvent>({ toGameMode: 'Survival' as MC.GameMode })
    world.beforeEvents.playerGameModeChange.subscribe((event) => {
      event.toGameMode = 'Creative' as MC.GameMode
    })
    emit(world.beforeEvents.playerGameModeChange, gameMode)
    expect(gameMode.toGameMode).toBe('Creative')

    const weather = payload<MC.WeatherChangeBeforeEvent>({ duration: 10, newWeather: 'Clear' as MC.WeatherType })
    world.beforeEvents.weatherChange.subscribe((event) => {
      event.duration = 20
      event.newWeather = 'Thunder' as MC.WeatherType
    })
    emit(world.beforeEvents.weatherChange, weather)
    expect(weather.duration).toBe(20)
    expect(weather.newWeather).toBe('Thunder')
  })
})

describe('raised signals', () => {
  it('raises entitySpawn from dimension.spawnEntity', () => {
    const server = createServer()
    withVanillaDimensions(server)
    let spawned = 0
    server.world.afterEvents.entitySpawn.subscribe(() => {
      spawned += 1
    })
    server.world.getDimension('overworld').spawnEntity('minecraft:sheep', { x: 0, y: 0, z: 0 })
    expect(spawned).toBe(1)
  })

  it('raises entityRemove before and after remove()', () => {
    const server = createServer()
    const entity = createEntity(server, { typeId: 'minecraft:sheep' })
    const order: string[] = []
    server.world.beforeEvents.entityRemove.subscribe(() => {
      order.push('before')
    })
    server.world.afterEvents.entityRemove.subscribe(() => {
      order.push('after')
    })
    entity.remove()
    expect(order).toEqual(['before', 'after'])
  })

  it('raises entityHurt before and after applyDamage, then entityHealthChanged, then entityDie', () => {
    const server = createServer()
    const entity = hurtable(server)
    const order: string[] = []
    server.world.beforeEvents.entityHurt.subscribe(() => {
      order.push('before:entityHurt')
    })
    server.world.afterEvents.entityHurt.subscribe(() => {
      order.push('after:entityHurt')
    })
    server.world.afterEvents.entityHealthChanged.subscribe(() => {
      order.push('after:entityHealthChanged')
    })
    server.world.afterEvents.entityDie.subscribe(() => {
      order.push('after:entityDie')
    })
    entity.applyDamage(8)
    expect(order).toEqual(['before:entityHurt', 'after:entityHurt', 'after:entityHealthChanged', 'after:entityDie'])
  })

  it('raises effectAdd before addEffect', () => {
    const server = createServer()
    const entity = createEntity(server, { typeId: 'minecraft:sheep' })
    let raised = 0
    server.world.beforeEvents.effectAdd.subscribe(() => {
      raised += 1
    })
    entity.addEffect('minecraft:speed', 100)
    expect(raised).toBe(1)
  })

  it('raises no before-event from kill()', () => {
    const server = createServer()
    const entity = hurtable(server)
    const before: string[] = []
    watchAll(server.world.beforeEvents, before, 'before')
    entity.kill()
    expect(before).toEqual([])
  })

  it('raises nothing outside the five after-events and three before-events', () => {
    const server = createServer()
    withVanillaDimensions(server)
    const delivered: string[] = []
    watchAll(server.world.afterEvents, delivered, 'after')
    watchAll(server.world.beforeEvents, delivered, 'before')

    const entity = server.world.getDimension('overworld').spawnEntity('minecraft:sheep', { x: 0, y: 0, z: 0 })
    addComponent(entity, 'minecraft:health', 8)
    entity.addEffect('minecraft:speed', 100)
    entity.applyDamage(1)
    entity.kill()
    entity.remove()

    expect([...new Set(delivered)].sort()).toEqual(
      [
        'after.entityDie',
        'after.entityHealthChanged',
        'after.entityHurt',
        'after.entityRemove',
        'after.entitySpawn',
        'before.effectAdd',
        'before.entityHurt',
        'before.entityRemove',
      ].sort(),
    )
  })

  it('lets emit drive a signal no fake behaviour raises', () => {
    const { world } = createServer()
    let received: MC.PlayerJoinAfterEvent | undefined
    world.afterEvents.playerJoin.subscribe((event) => {
      received = event
    })
    const sent = payload<MC.PlayerJoinAfterEvent>({ playerId: 'p1', playerName: 'Ann' })
    emit(world.afterEvents.playerJoin, sent)
    expect(received).toBe(sent)
  })
})

describe('two bundles', () => {
  it('share no signal subscribers', () => {
    const a = createServer()
    const b = createServer()
    let calls = 0
    a.world.afterEvents.entityHurt.subscribe(() => {
      calls += 1
    })
    emit(b.world.afterEvents.entityHurt, payload<MC.EntityHurtAfterEvent>({ damage: 1 }))
    expect(calls).toBe(0)
    emit(a.world.afterEvents.entityHurt, payload<MC.EntityHurtAfterEvent>({ damage: 1 }))
    expect(calls).toBe(1)
  })

  it('share no handler errors', () => {
    const a = createServer()
    const b = createServer()
    a.world.afterEvents.entityHurt.subscribe(() => {
      throw new Error('deliberate')
    })
    emit(a.world.afterEvents.entityHurt, payload<MC.EntityHurtAfterEvent>({ damage: 1 }))
    expect(getHandlerErrors(a)).toHaveLength(1)
    expect(getHandlerErrors(b)).toEqual([])
  })
})

describe('the internal raise path', () => {
  it('throws on a signal name no container answers to', () => {
    const server = createServer()
    const state = serverOf(server.world)
    expect(() => {
      dispatchAfter(state, 'entityHurted', {})
    }).toThrow(TypeError)
    expect(() => {
      dispatchAfter(state, 'entityHurt', {})
    }).not.toThrow()
  })
})
