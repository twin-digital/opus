import { describe, expect, it, vi } from 'vitest'
import type { Entity, World } from '@minecraft/server'

import { INVULNERABLE_TAG, registerInvulnerabilityGuard, setInvulnerable } from './invulnerable.js'

const HEALTH_COMPONENT_ID = 'minecraft:health'

/** Must match `RESISTANCE_TICKS` in the source: 20 ticks/sec → ~1 hour. */
const RESISTANCE_TICKS = 20 * 60 * 60

interface MakeEntityOptions {
  tags?: string[]

  /** Whether the entity has a health component. `false` makes `getComponent` return `undefined`. */
  health?: boolean
}

/**
 * A duck-typed {@link Entity}: tag methods are backed by a real `Set`, effect methods are inert
 * spies, and `getComponent` honors its argument.
 */
const makeEntity = ({ tags = [], health: hasHealth = true }: MakeEntityOptions = {}) => {
  const set = new Set(tags)
  const health = { resetToMaxValue: vi.fn() }

  const spies = {
    hasTag: vi.fn((tag: string) => set.has(tag)),
    addTag: vi.fn((tag: string) => {
      set.add(tag)
      return true
    }),
    removeTag: vi.fn((tag: string) => set.delete(tag)),
    addEffect: vi.fn(),
    removeEffect: vi.fn(),
    getComponent: vi.fn((componentId: string) =>
      hasHealth && componentId === HEALTH_COMPONENT_ID ? health : undefined,
    ),
  }

  return { entity: spies as unknown as Entity, spies, health }
}

// An entity that has been unloaded/killed: every method throws, as the real API does once an
// entity is invalid. The proxy covers methods the source may start calling later.
const makeInvalidEntity = () =>
  new Proxy(
    {},
    {
      get: () => () => {
        throw new Error('entity invalidated')
      },
    },
  ) as Entity

type HurtHandler = (event: { hurtEntity: Entity }) => void

interface MakeWorldOptions {
  /** Number of leading `subscribe` calls that throw, simulating a failed registration. */
  failSubscriptions?: number
}

/** A duck-typed {@link World} whose `entityHurt` subscribers can be driven via `emitHurt`. */
const makeWorld = ({ failSubscriptions = 0 }: MakeWorldOptions = {}) => {
  const handlers: HurtHandler[] = []
  let remainingFailures = failSubscriptions

  const world = {
    afterEvents: {
      entityHurt: {
        subscribe: (handler: HurtHandler) => {
          if (remainingFailures > 0) {
            remainingFailures -= 1
            throw new Error('subscribe failed')
          }
          handlers.push(handler)
        },
      },
    },
  }

  return {
    world: world as unknown as World,
    subscriberCount: () => handlers.length,
    emitHurt: (hurtEntity: Entity) => {
      if (handlers.length === 0) {
        throw new Error('emitHurt called before any handler subscribed')
      }
      handlers.forEach((handler) => {
        handler({ hurtEntity })
      })
    },
  }
}

describe('INVULNERABLE_TAG', () => {
  // Pinned literally: in-game selectors and other behavior packs match on this string, so a
  // rename is a breaking change rather than an internal refactor.
  it('is the tag other packs and selectors match on', () => {
    expect(INVULNERABLE_TAG).toBe('invulnerable')
  })
})

describe('setInvulnerable', () => {
  it.each([
    { label: 'hidden by default', options: undefined, showParticles: false },
    { label: 'visible when requested', options: { showParticles: true }, showParticles: true },
  ])('tags the entity and applies Resistance, $label', ({ options, showParticles }) => {
    const { entity, spies } = makeEntity()

    setInvulnerable(entity, options)

    expect(spies.addTag).toHaveBeenCalledExactlyOnceWith(INVULNERABLE_TAG)
    expect(spies.addEffect).toHaveBeenCalledExactlyOnceWith('resistance', RESISTANCE_TICKS, {
      amplifier: 255,
      showParticles,
    })
  })

  it('clears the tag and effect when disabled', () => {
    const { entity, spies } = makeEntity({ tags: [INVULNERABLE_TAG] })

    setInvulnerable(entity, { enabled: false })

    expect(spies.removeTag).toHaveBeenCalledExactlyOnceWith(INVULNERABLE_TAG)
    expect(spies.removeEffect).toHaveBeenCalledExactlyOnceWith('resistance')
    expect(spies.addTag).not.toHaveBeenCalled()
    expect(spies.addEffect).not.toHaveBeenCalled()
  })

  it('does not re-add the tag when already present (idempotent)', () => {
    const { entity, spies } = makeEntity({ tags: [INVULNERABLE_TAG] })

    setInvulnerable(entity)

    expect(spies.addTag).not.toHaveBeenCalled()
    expect(spies.addEffect).toHaveBeenCalled()
  })

  it.each([
    { label: 'enabling', options: undefined },
    { label: 'disabling', options: { enabled: false } },
  ])('swallows errors from an unloaded/invalidated entity when $label', ({ options }) => {
    expect(() => {
      setInvulnerable(makeInvalidEntity(), options)
    }).not.toThrow()
  })
})

describe('registerInvulnerabilityGuard', () => {
  it('subscribes the entityHurt backstop exactly once per world', () => {
    const { world, subscriberCount } = makeWorld()

    registerInvulnerabilityGuard(world)
    registerInvulnerabilityGuard(world)

    expect(subscriberCount()).toBe(1)
  })

  it('guards each world independently', () => {
    const first = makeWorld()
    const second = makeWorld()

    registerInvulnerabilityGuard(first.world)
    registerInvulnerabilityGuard(second.world)

    expect(first.subscriberCount()).toBe(1)
    expect(second.subscriberCount()).toBe(1)
  })

  it('stays retryable when subscribing throws', () => {
    const { world, subscriberCount } = makeWorld({ failSubscriptions: 1 })

    expect(() => {
      registerInvulnerabilityGuard(world)
    }).toThrow()
    registerInvulnerabilityGuard(world)

    expect(subscriberCount()).toBe(1)
  })

  it('heals a tagged entity back to full when it is hurt', () => {
    const { entity, spies, health } = makeEntity({ tags: [INVULNERABLE_TAG] })
    const { world, emitHurt } = makeWorld()
    registerInvulnerabilityGuard(world)

    emitHurt(entity)

    expect(spies.getComponent).toHaveBeenCalledExactlyOnceWith(HEALTH_COMPONENT_ID)
    expect(health.resetToMaxValue).toHaveBeenCalledOnce()
  })

  it('ignores an untagged entity that is hurt', () => {
    const { entity, health } = makeEntity()
    const { world, emitHurt } = makeWorld()
    registerInvulnerabilityGuard(world)

    emitHurt(entity)

    expect(health.resetToMaxValue).not.toHaveBeenCalled()
  })

  it('tolerates a tagged entity with no health component', () => {
    const { entity } = makeEntity({ tags: [INVULNERABLE_TAG], health: false })
    const { world, emitHurt } = makeWorld()
    registerInvulnerabilityGuard(world)

    expect(() => {
      emitHurt(entity)
    }).not.toThrow()
  })

  it('does not propagate when the hurt entity was invalidated by the hit', () => {
    const { world, emitHurt } = makeWorld()
    registerInvulnerabilityGuard(world)

    expect(() => {
      emitHurt(makeInvalidEntity())
    }).not.toThrow()
  })

  it('heals an entity tagged via setInvulnerable', () => {
    const { entity, health } = makeEntity()
    const { world, emitHurt } = makeWorld()
    registerInvulnerabilityGuard(world)

    setInvulnerable(entity)
    emitHurt(entity)

    expect(health.resetToMaxValue).toHaveBeenCalledOnce()
  })
})
