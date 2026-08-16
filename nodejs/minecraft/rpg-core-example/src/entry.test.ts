/**
 * The pack's entry point — `src/main.ts`, the one file the engine executes — is exercised as the
 * engine executes it: evaluated for its side effects, against a world and system it reached
 * through its own `@minecraft/server` import. The rest of the suite drives the
 * adventure through handles it passes in, so it would pass unchanged against an entry that
 * imported the wrong names or called nothing. This file is what fails in that case.
 *
 * The assertions read the adventure's own behaviour — every placement pursued to an end, every
 * failure reported in chat rather than escaping. They deliberately accept either ending for each
 * actor, because under the shipped fakes the library's definitions check itself is not
 * implementable (`EntityTypes.get` throws), so placement ends in a report; in a live world it
 * ends standing. The library's spawn contract is tested in `@twin-digital/rpg-core`.
 */

import {
  advanceTicks,
  emit,
  getHandlerErrors,
  getOutput,
  withVanillaDimensions,
  type FakeServer,
} from '@twin-digital/minecraft-test-lib'
import { loadPack } from '@twin-digital/minecraft-test-lib/vitest'
import { beforeEach, describe, expect, it } from 'vitest'

import { PLACEMENT_ATTEMPTS, PLACEMENT_TICKS, placements } from './adventure.js'

let server: FakeServer

beforeEach(async () => {
  // The entry evaluates here, against a world of its own and nothing this file hands it.
  server = await loadPack(() => import('./main.js'))
  withVanillaDimensions(server)
})

describe('the pack entry point', () => {
  it('only subscribes at evaluation — no actor placed, nothing said, before the world loads', () => {
    expect(server.world.getDimension('overworld').getEntities()).toHaveLength(0)
    expect(getOutput(server.world)).toHaveLength(0)
    expect(getHandlerErrors(server)).toHaveLength(0)
  })

  it('pursues every placement to an end from the world it imported, once that world loads', () => {
    emit(server.world.afterEvents.worldLoad, {})
    advanceTicks(server, PLACEMENT_TICKS * PLACEMENT_ATTEMPTS)

    const overworld = server.world.getDimension('overworld')
    const messages = getOutput(server.world).flatMap((record) =>
      typeof record.value === 'string' ? [record.value] : [],
    )
    for (const placement of placements()) {
      const stood = overworld.getEntities().length > 0
      const reported = messages.some((message) => message.includes(`'${placement.key}'`))
      expect(stood || reported, `placement '${placement.key}' reached no end`).toBe(true)
    }

    // every failure is the adventure's to report; none escapes a handler or the scheduler
    expect(getHandlerErrors(server)).toHaveLength(0)
  })
})
