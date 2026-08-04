/**
 * The aliased `@minecraft/server` surface: what it carries, where each value came from, and the
 * `instanceof` it answers. The expected sets are read straight out of the pinned declarations
 * here, by a different route from the one the generator takes, so the two have to agree.
 */

import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { createEntity, createPlayer, createServer, addComponent, NotImplementedError } from '../index.js'
import { SERVER_VERSION } from '../generated/shim/version.js'
import * as shim from './index.js'

const require = createRequire(import.meta.url)
const dtsPath = require.resolve('@minecraft/server/index.d.ts')
const declarations = fs.readFileSync(dtsPath, 'utf8')

const declaredVersion = (
  JSON.parse(fs.readFileSync(path.join(path.dirname(dtsPath), 'package.json'), 'utf8')) as { version: string }
).version

const namesDeclaredBy = (keyword: string): string[] =>
  [...declarations.matchAll(new RegExp(`^export ${keyword} ([A-Za-z0-9_]+)`, 'gm'))].map((match) => match[1])

const declaredEnums = namesDeclaredBy('enum')
const declaredClasses = namesDeclaredBy('class')
const declaredConstants = [...declarations.matchAll(/^export const ([A-Za-z0-9_]+)/gm)].map((match) => match[1])

const exported = Object.keys(shim)

describe('the derived version', () => {
  it('is the pinned one, stated inertly', () => {
    expect(SERVER_VERSION).toBe(declaredVersion)
    expect(SERVER_VERSION).toBe('2.8.0')
  })

  it('is not on the aliased surface, which carries only declared names', () => {
    expect(exported).not.toContain('SERVER_VERSION')
  })
})

describe('the export set', () => {
  it('carries every enum, class and constant the declarations declare', () => {
    for (const name of [...declaredEnums, ...declaredClasses, ...declaredConstants]) {
      expect(exported, `missing ${name}`).toContain(name)
    }
  })

  it('carries nothing the declarations do not declare', () => {
    const declared = new Set([...declaredEnums, ...declaredClasses, ...declaredConstants])
    expect(exported.filter((name) => !declared.has(name))).toEqual([])
  })

  it('answers no name outside that set — no Proxy, no auto-vivified stub', () => {
    expect((shim as Record<string, unknown>).NoSuchThing).toBeUndefined()
  })
})

describe('enum values', () => {
  it('are derived from the declarations, member for member', () => {
    // A string enum, a numeric one, and one whose values are prefixed ids.
    expect(shim.EntityDamageCause.anvil).toBe('anvil')
    expect(shim.BlockVolumeIntersection.Disjoint).toBe(0)
    expect(shim.EntityComponentTypes.Health).toBe('minecraft:health')
  })

  it('cover every member the declarations give an enum', () => {
    const body = /export enum EntityDamageCause \{([\s\S]*?)\n\}/.exec(declarations)?.[1] ?? ''
    // Reserved-word members arrive quoted in the declarations — `'void' = 'void'`.
    const members = [...body.matchAll(/^ {4}'?([A-Za-z0-9_]+)'? = /gm)].map((match) => match[1])
    expect(members.length).toBeGreaterThan(0)
    expect(Object.keys(shim.EntityDamageCause).sort()).toEqual(members.sort())
  })

  it('are frozen', () => {
    for (const name of declaredEnums) {
      expect(Object.isFrozen((shim as unknown as Record<string, object>)[name]), name).toBe(true)
    }
  })
})

describe('module constants', () => {
  it('carry the declared values', () => {
    expect(shim.TicksPerSecond).toBe(20)
    expect(shim.TicksPerDay).toBe(24000)
    expect(shim.MoonPhaseCount).toBe(8)
  })
})

describe('classes', () => {
  it('are every class the declarations export', () => {
    for (const name of declaredClasses) {
      expect(typeof (shim as Record<string, unknown>)[name], name).toBe('function')
    }
  })

  it('emit a declared error class as a real Error subclass naming itself', () => {
    const thrown = new shim.CommandError('boom')
    expect(thrown).toBeInstanceOf(Error)
    expect(thrown.name).toBe('CommandError')
    expect(thrown.message).toBe('boom')
  })

  it('carry one class object per name for the errors the fakes throw', async () => {
    const { InvalidEntityError } = await import('../errors.js')
    expect(shim.InvalidEntityError).toBe(InvalidEntityError)
  })

  it('refuse construction of a class the fakes do not implement', () => {
    expect(() => new shim.ItemStack()).toThrow(NotImplementedError)
    expect(() => new shim.ItemStack()).toThrow(/ItemStack/)
  })
})

describe('instanceof', () => {
  it('answers true for the corresponding fake and false for anything else', () => {
    const server = createServer()
    const entity = createEntity(server, { typeId: 'minecraft:sheep' })
    expect(entity).toBeInstanceOf(shim.Entity)
    expect({}).not.toBeInstanceOf(shim.Entity)
    expect(entity).not.toBeInstanceOf(shim.Player)
  })

  it('puts the exported class on the fake prototype chain, with no hasInstance override', () => {
    const server = createServer()
    const entity = createEntity(server, { typeId: 'minecraft:sheep' })
    expect(Object.getPrototypeOf(entity)).toBe(shim.Entity.prototype)
    expect(Object.getOwnPropertySymbols(shim.Entity)).not.toContain(Symbol.hasInstance)
  })

  it('carries no hasInstance override on any exported class', () => {
    for (const name of declaredClasses) {
      const value = (shim as unknown as Record<string, object>)[name]
      expect(Object.getOwnPropertySymbols(value), name).not.toContain(Symbol.hasInstance)
    }
  })

  it('answers the declared inheritance — a player is an Entity', () => {
    const server = createServer()
    const player = createPlayer(server, {})
    expect(player).toBeInstanceOf(shim.Player)
    expect(player).toBeInstanceOf(shim.Entity)
  })

  it('answers the declared inheritance on a component', () => {
    const server = createServer()
    const entity = createEntity(server, { typeId: 'minecraft:sheep' })
    const component = addComponent(entity, 'minecraft:health', 20)
    expect(component).toBeInstanceOf(shim.EntityHealthComponent)
    expect(component).toBeInstanceOf(shim.EntityAttributeComponent)
    expect(component).toBeInstanceOf(shim.EntityComponent)
    expect(component).toBeInstanceOf(shim.Component)
  })
})
