/**
 * A duration a before-event handler writes to `EffectAddBeforeEvent.duration` is validated by a
 * different path from `addEffect`'s own duration argument, and the two disagree. What the field
 * write does is reproduced here: truncated toward zero, dropped entirely at or below zero, clamped
 * above the maximum, and refused by the setter itself on NaN and Infinity.
 *
 * `addEffect`'s own argument rejects 0 and 20000001 outright and clamps nothing; both of those
 * values reach an effect through the field write instead.
 */

import type * as MC from '@minecraft/server'
import { beforeEach, describe, expect, it } from 'vitest'

import { addComponent, createEntity, createServer, withVanillaDimensions, type FakeServer } from './index.js'

const MAXIMUM = 20000000

let server: FakeServer
let entity: MC.Entity

/** Subscribes a handler that writes `written` to the duration, then adds an effect. */
const addWithHandlerWriting = (written: number): MC.Effect | undefined => {
  server.world.beforeEvents.effectAdd.subscribe((event) => {
    event.duration = written
  })
  return entity.addEffect('minecraft:speed', 100)
}

beforeEach(() => {
  server = createServer()
  withVanillaDimensions(server)
  entity = createEntity(server, { typeId: 'minecraft:sheep', dimension: server.world.getDimension('overworld') })
  addComponent(entity, 'minecraft:health', 20)
})

describe('a fractional write', () => {
  it('is truncated toward zero', () => {
    expect(addWithHandlerWriting(2.5)?.duration).toBe(2)
    expect(entity.getEffect('minecraft:speed')?.duration).toBe(2)
  })

  it('truncates a large fraction the same way', () => {
    expect(addWithHandlerWriting(300.7)?.duration).toBe(300)
  })
})

describe('a write at or below zero', () => {
  it.each([0, -1, -400])('drops the add entirely for %i', (written) => {
    expect(addWithHandlerWriting(written)).toBeUndefined()
    expect(entity.getEffect('minecraft:speed')).toBeUndefined()
    expect(entity.getEffects()).toEqual([])
  })

  it('is not what the call argument does with the same value', () => {
    // The argument path refuses 0 outright; the field write silently drops the add instead.
    expect(() => entity.addEffect('minecraft:speed', 0)).toThrow()
  })
})

describe('a write above the maximum', () => {
  it.each([MAXIMUM + 1, 100000000])('clamps %i to the maximum rather than refusing it', (written) => {
    expect(addWithHandlerWriting(written)?.duration).toBe(MAXIMUM)
    expect(entity.getEffect('minecraft:speed')?.duration).toBe(MAXIMUM)
  })

  it('is not what the call argument does with the same value', () => {
    expect(() => entity.addEffect('minecraft:speed', MAXIMUM + 1)).toThrow()
  })
})

describe('a write of NaN or Infinity', () => {
  it.each([NaN, Infinity, -Infinity])('is refused by the setter itself for %s', (written) => {
    const thrown: unknown[] = []
    server.world.beforeEvents.effectAdd.subscribe((event) => {
      try {
        event.duration = written
      } catch (error) {
        thrown.push(error)
      }
    })
    const effect = entity.addEffect('minecraft:speed', 100)
    expect(thrown[0]).toBeInstanceOf(TypeError)
    expect((thrown[0] as Error).message).toBe('NaN value is not supported. Function return value expected type: number')
    // The field keeps the duration the caller requested, and that is what the effect carries.
    expect(effect?.duration).toBe(100)
  })
})

describe('the other four mutable before-event fields', () => {
  it('are writable and unread — the fake raises no action that consumes them', () => {
    const written: number[] = []
    server.world.beforeEvents.weatherChange.subscribe((event) => {
      event.duration = 20
      written.push(event.duration)
    })
    // Nothing the fakes do raises weatherChange, so the write is observable only on the payload.
    expect(written).toEqual([])
  })
})
