import { describe, expect, it, vi } from 'vitest'
import type { Entity, World } from '@minecraft/server'

import { INVULNERABLE_TAG, registerInvulnerabilityGuard, setInvulnerable } from './invulnerable.js'

const makeEntity = (tags: string[] = []) => {
  const set = new Set(tags)
  const health = { resetToMaxValue: vi.fn() }
  const spies = {
    hasTag: vi.fn((tag: string) => set.has(tag)),
    addTag: vi.fn((tag: string) => set.add(tag)),
    removeTag: vi.fn((tag: string) => set.delete(tag)),
    addEffect: vi.fn(),
    removeEffect: vi.fn(),
    getComponent: vi.fn(() => health),
  }
  return { entity: spies as unknown as Entity, spies, health }
}

const makeWorld = () => {
  const hurtHandlers: ((event: { hurtEntity: Entity }) => void)[] = []
  const world = {
    afterEvents: {
      entityHurt: {
        subscribe: (handler: (event: { hurtEntity: Entity }) => void) => {
          hurtHandlers.push(handler)
        },
      },
    },
  }
  return { world: world as unknown as World, hurtHandlers }
}

describe('setInvulnerable', () => {
  it('tags the entity and applies hidden Resistance by default', () => {
    const { entity, spies } = makeEntity()

    setInvulnerable(entity)

    expect(spies.addTag).toHaveBeenCalledWith(INVULNERABLE_TAG)
    expect(spies.addEffect).toHaveBeenCalledWith('resistance', expect.any(Number), {
      amplifier: 255,
      showParticles: false,
    })
  })

  it('forwards showParticles when requested', () => {
    const { entity, spies } = makeEntity()

    setInvulnerable(entity, { showParticles: true })

    expect(spies.addEffect).toHaveBeenCalledWith('resistance', expect.any(Number), {
      amplifier: 255,
      showParticles: true,
    })
  })

  it('clears the tag and effect when disabled', () => {
    const { entity, spies } = makeEntity([INVULNERABLE_TAG])

    setInvulnerable(entity, { enabled: false })

    expect(spies.removeTag).toHaveBeenCalledWith(INVULNERABLE_TAG)
    expect(spies.removeEffect).toHaveBeenCalledWith('resistance')
    expect(spies.addEffect).not.toHaveBeenCalled()
  })

  it('does not re-add the tag when already present (idempotent)', () => {
    const { entity, spies } = makeEntity([INVULNERABLE_TAG])

    setInvulnerable(entity)

    expect(spies.addTag).not.toHaveBeenCalled()
    expect(spies.addEffect).toHaveBeenCalled()
  })

  it('swallows errors from an unloaded/invalidated entity', () => {
    const { entity, spies } = makeEntity()
    spies.addEffect.mockImplementation(() => {
      throw new Error('entity invalidated')
    })

    expect(() => {
      setInvulnerable(entity)
    }).not.toThrow()
  })
})

describe('registerInvulnerabilityGuard', () => {
  it('subscribes the entityHurt backstop exactly once per world', () => {
    const { world, hurtHandlers } = makeWorld()

    registerInvulnerabilityGuard(world)
    registerInvulnerabilityGuard(world)

    expect(hurtHandlers).toHaveLength(1)
  })

  it('guards each world independently', () => {
    const first = makeWorld()
    const second = makeWorld()

    registerInvulnerabilityGuard(first.world)
    registerInvulnerabilityGuard(second.world)

    expect(first.hurtHandlers).toHaveLength(1)
    expect(second.hurtHandlers).toHaveLength(1)
  })

  it('heals a tagged entity back to full when it is hurt', () => {
    const { entity, health } = makeEntity([INVULNERABLE_TAG])
    const { world, hurtHandlers } = makeWorld()
    registerInvulnerabilityGuard(world)

    hurtHandlers[0]({ hurtEntity: entity })

    expect(health.resetToMaxValue).toHaveBeenCalledTimes(1)
  })

  it('ignores an untagged entity that is hurt', () => {
    const { entity, health } = makeEntity()
    const { world, hurtHandlers } = makeWorld()
    registerInvulnerabilityGuard(world)

    hurtHandlers[0]({ hurtEntity: entity })

    expect(health.resetToMaxValue).not.toHaveBeenCalled()
  })
})
