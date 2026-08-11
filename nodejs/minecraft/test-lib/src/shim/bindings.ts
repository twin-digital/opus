/**
 * The module-scope `world`, `system` and `EntityTypes` a test points at its own fakes, and the one
 * call that points them. This is the only mutable state the package holds outside a world instance.
 *
 * The bindings are live ESM exports: the aliased `@minecraft/server` surface re-exports them, so
 * pack code reaching the engine through the module import reads whatever a test installed last.
 */

import type * as MC from '@minecraft/server'

import type { FakeServer } from '../create-server.js'
import { ShimNotInstalledError, ShimServerInUseError } from '../errors.js'
import { stateOf } from '../runtime/member.js'
import { serverOf } from '../runtime/state.js'

/**
 * The value a binding holds before a server is installed. A function target so a call and a `new`
 * fail the same loud way a property read does; every trap throws, so no access reads `undefined`.
 */
const unsetBinding = (binding: string): never => {
  const raise = (): never => {
    throw new ShimNotInstalledError(binding)
  }
  const target = function unset(): void {
    /* the sentinel is never called: every trap throws first */
  }
  return new Proxy(target, {
    apply: raise,
    construct: raise,
    defineProperty: raise,
    deleteProperty: raise,
    get: raise,
    getOwnPropertyDescriptor: raise,
    has: raise,
    ownKeys: raise,
    set: raise,
    setPrototypeOf: raise,
  }) as never
}

/** The server currently installed, or `undefined` while the bindings are unset. */
let current: FakeServer | undefined

/** The world code under test reaches through `import { world } from '@minecraft/server'`. */
export let world: MC.World = unsetBinding('world')

/** The `system` code under test reaches through `import { system } from '@minecraft/server'`. */
export let system: MC.System = unsetBinding('system')

/**
 * The type catalog code under test reaches through
 * `import { EntityTypes } from '@minecraft/server'`. It belongs to one server, so it moves with the
 * other two bindings rather than standing as one class object every server shares.
 */
export let EntityTypes: typeof MC.EntityTypes = unsetBinding('EntityTypes')

/** How much of a pack is bound to a server: what a wholesale replace would strand. */
const liveWork = (server: FakeServer): { subscribers: number; scheduledRuns: number } | null => {
  try {
    stateOf(server.world)
  } catch {
    // A server this package did not build carries no state to inspect, so it is not inspected.
    return null
  }
  const state = serverOf(server.world)
  return {
    subscribers: [...state.signals.values()].reduce((total, signal) => total + signal.subscribers.size, 0),
    scheduledRuns: state.scheduled.filter((run) => !run.cancelled).length,
  }
}

/**
 * Points the module-scope bindings at a server, or returns them to the unset state when called
 * with no argument. All three bindings move together — there is no way to install one alone.
 *
 * Replacing a server a pack has already registered against throws: the pack's subscriptions and
 * scheduled runs stay on the server it evaluated against, so the replacement would see none of its
 * behaviour. Reach for `loadPack` from the vitest tooling when a test needs a fresh evaluation.
 *
 * @example
 * ```ts
 * import { createServer, __useServer } from '@twin-digital/minecraft-test-lib'
 *
 * __useServer(createServer())
 * ```
 */
export const __useServer = (server?: FakeServer): void => {
  if (server === undefined) {
    current = undefined
    world = unsetBinding('world')
    system = unsetBinding('system')
    EntityTypes = unsetBinding('EntityTypes')
    return
  }

  if (current !== undefined) {
    const live = liveWork(current)
    if (live && (live.subscribers > 0 || live.scheduledRuns > 0)) {
      throw new ShimServerInUseError(live.subscribers, live.scheduledRuns)
    }
  }

  current = server
  world = server.world
  system = server.system
  EntityTypes = server.EntityTypes
}

/**
 * The server the bindings currently point at — how a test reaches the server the plugin's setup
 * module installed, for the free functions that take one.
 *
 * @example
 * ```ts
 * import { advanceTicks, currentServer } from '@twin-digital/minecraft-test-lib'
 *
 * advanceTicks(currentServer(), 20)
 * ```
 */
export const currentServer = (): FakeServer => {
  if (current === undefined) {
    throw new ShimNotInstalledError('currentServer()')
  }
  return current
}
