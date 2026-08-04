/**
 * The escape hatch: a fresh evaluation per test, with the pack's registrations on the server
 * `loadPack` hands back.
 */

import { Player } from '@minecraft/server'
import { advanceTicks, createPlayer, NotImplementedError } from '@twin-digital/minecraft-test-lib'
import { loadPack } from '@twin-digital/minecraft-test-lib/vitest'
import { describe, expect, it } from 'vitest'

describe('loadPack', () => {
  it('returns the server the pack registered against', async () => {
    const server = await loadPack(() => import('./pack.js'))
    expect(server.system.currentTick).toBe(0)
    advanceTicks(server, 2)
    expect(server.system.currentTick).toBe(2)
  })

  it('starts the next test from a world of its own', async () => {
    const server = await loadPack(() => import('./pack.js'))
    expect(server.system.currentTick).toBe(0)
  })
})

describe('class identity across the reset', () => {
  it('answers instanceof against the statically imported class', async () => {
    const server = await loadPack(() => import('./pack.js'))
    expect(createPlayer(server, {})).toBeInstanceOf(Player)
  })
})

describe('error identity across the reset', () => {
  it('catches the package error class the test statically imported', async () => {
    const server = await loadPack(() => import('./pack.js'))
    const player = createPlayer(server, {})
    let caught: unknown
    try {
      player.getSpawnPoint()
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(NotImplementedError)
  })
})

describe('a fake built by one module generation', () => {
  it('is recognised by a free function reached through another', async () => {
    // The pack reaches the library through the alias, by absolute path; this file reaches it by
    // bare specifier, and loadPack's reset puts a module boundary between the two. The free
    // functions imported at the top of this file must still recognise what loadPack handed back.
    const server = await loadPack(() => import('./pack.js'))
    const player = createPlayer(server, {})
    expect(() => {
      advanceTicks(server, 1)
    }).not.toThrow()
    expect(player.typeId).toBe('minecraft:player')
  })
})
