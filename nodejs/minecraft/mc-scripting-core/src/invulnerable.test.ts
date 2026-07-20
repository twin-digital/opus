import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Entity } from '@minecraft/server'

// `@minecraft/server` is aliased to test/minecraft-server.stub.ts (see
// vitest.config.ts). Re-importing after resetModules gives both the stub and the
// module-under-test a fresh instance, resetting the one-shot `guardRegistered`
// flag and the stub's captured handlers.
let invulnerable: typeof import('./invulnerable.js')
let stub: typeof import('../test/minecraft-server.stub.js')

beforeEach(async () => {
  vi.resetModules()
  stub = await import('../test/minecraft-server.stub.js')
  invulnerable = await import('./invulnerable.js')
})

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

describe('setInvulnerable', () => {
  it('tags the entity and applies hidden Resistance by default', () => {
    const { entity, spies } = makeEntity()

    invulnerable.setInvulnerable(entity)

    expect(spies.addTag).toHaveBeenCalledWith(invulnerable.INVULNERABLE_TAG)
    expect(spies.addEffect).toHaveBeenCalledWith('resistance', expect.any(Number), {
      amplifier: 255,
      showParticles: false,
    })
  })

  it('forwards showParticles when requested', () => {
    const { entity, spies } = makeEntity()

    invulnerable.setInvulnerable(entity, { showParticles: true })

    expect(spies.addEffect).toHaveBeenCalledWith('resistance', expect.any(Number), {
      amplifier: 255,
      showParticles: true,
    })
  })

  it('clears the tag and effect when disabled', () => {
    const { entity, spies } = makeEntity([invulnerable.INVULNERABLE_TAG])

    invulnerable.setInvulnerable(entity, { enabled: false })

    expect(spies.removeTag).toHaveBeenCalledWith(invulnerable.INVULNERABLE_TAG)
    expect(spies.removeEffect).toHaveBeenCalledWith('resistance')
    expect(spies.addEffect).not.toHaveBeenCalled()
  })

  it('does not re-add the tag when already present (idempotent)', () => {
    const { entity, spies } = makeEntity([invulnerable.INVULNERABLE_TAG])

    invulnerable.setInvulnerable(entity)

    expect(spies.addTag).not.toHaveBeenCalled()
    expect(spies.addEffect).toHaveBeenCalled()
  })

  it('swallows errors from an unloaded/invalidated entity', () => {
    const { entity, spies } = makeEntity()
    spies.addEffect.mockImplementation(() => {
      throw new Error('entity invalidated')
    })

    expect(() => {
      invulnerable.setInvulnerable(entity)
    }).not.toThrow()
  })
})

describe('lazy guard registration', () => {
  it('registers the entityHurt backstop exactly once across many calls', () => {
    invulnerable.setInvulnerable(makeEntity().entity)
    invulnerable.setInvulnerable(makeEntity().entity)
    invulnerable.registerInvulnerabilityGuard()

    expect(stub.hurtHandlers).toHaveLength(1)
  })

  it('does not subscribe until the first use', () => {
    expect(stub.hurtHandlers).toHaveLength(0)

    invulnerable.setInvulnerable(makeEntity().entity)

    expect(stub.hurtHandlers).toHaveLength(1)
  })

  it('heals a tagged entity back to full when it is hurt', () => {
    const { entity, health } = makeEntity([invulnerable.INVULNERABLE_TAG])
    invulnerable.registerInvulnerabilityGuard()

    stub.hurtHandlers[0]({ hurtEntity: entity })

    expect(health.resetToMaxValue).toHaveBeenCalledTimes(1)
  })

  it('ignores an untagged entity that is hurt', () => {
    const { entity, health } = makeEntity()
    invulnerable.registerInvulnerabilityGuard()

    stub.hurtHandlers[0]({ hurtEntity: entity })

    expect(health.resetToMaxValue).not.toHaveBeenCalled()
  })
})
