/**
 * The event bus: the signal objects on `world.afterEvents`, `world.beforeEvents` and `system`, the
 * subscription semantics the engine was observed to have, synchronous dispatch, handler-throw
 * isolation with the record behind `getHandlerErrors`, and the `emit` free function.
 *
 * Every declared signal exists and accepts subscribers. Only a small set is raised by the fakes'
 * own behaviour; any other signal is driven by a test calling `emit`.
 */

import type * as MC from '@minecraft/server'

import type { ServerLike } from './create-server.js'
import { NotImplementedError } from './errors.js'
import {
  SIGNAL_CLASS_BY_CONTAINER,
  SIGNAL_CLASSES,
  SystemAfterEventsManifest,
  SystemBeforeEventsManifest,
  WorldAfterEventsManifest,
  WorldBeforeEventsManifest,
} from './generated/manifests.js'
import { construct } from './runtime/construct.js'
import { registerBehaviour, stateOf, type ClassBehaviour } from './runtime/member.js'
import {
  dataOf,
  serverOf,
  type HandlerError,
  type ServerState,
  type SignalScope,
  type SignalState,
} from './runtime/state.js'

/** How a signal is keyed within a bundle: its container and its name on that container. */
const signalKey = (scope: SignalScope, name: string): string => `${scope}.${name}`

/** The state behind a signal fake. */
interface SignalData {
  readonly server: ServerState
  readonly signal: SignalState
}

/** The state behind a signal container — `world.afterEvents` and its three siblings. */
interface ContainerData {
  readonly server: ServerState
}

/** The signal object one container hands out under one name. */
export const signalOf = (server: ServerState, scope: SignalScope, name: string): object => {
  const state = server.signals.get(signalKey(scope, name))
  if (!state) {
    throw new NotImplementedError(`${scope}.${name}`)
  }
  return state.fake
}

/**
 * Runs every subscriber on a signal, in subscription order. A subscriber that throws is isolated as
 * the engine isolates it — the throw reaches neither the caller nor the other subscribers, and the
 * rest of the cascade still fires — and the error is recorded for `getHandlerErrors`, where the
 * engine discards it.
 */
export const deliver = (server: ServerState, scope: SignalScope, name: string, payload: unknown): void => {
  const state = server.signals.get(signalKey(scope, name))
  if (!state) {
    return
  }
  for (const subscriber of [...state.subscribers]) {
    try {
      ;(subscriber as (value: unknown) => void)(payload)
    } catch (error) {
      server.handlerErrors.push({ signal: signalKey(scope, name), error })
    }
  }
}

/** Delivers an after-event synchronously, inside the call that caused it. */
export const dispatchAfter = (server: ServerState, name: string, payload: unknown): void => {
  deliver(server, 'world.afterEvents', name, payload)
}

/**
 * Delivers a before-event ahead of the action it gates, and answers whether the action may proceed.
 * A payload with no `cancel` field is a notification the engine gives a handler no hold on.
 */
export const dispatchBefore = (server: ServerState, name: string, payload: { cancel?: boolean }): boolean => {
  deliver(server, 'world.beforeEvents', name, payload)
  return payload.cancel !== true
}

/** The names each signal container carries, taken from the manifests the generator committed. */
const CONTAINERS = [
  { scope: 'world.afterEvents', className: 'WorldAfterEvents', names: WorldAfterEventsManifest.properties },
  { scope: 'world.beforeEvents', className: 'WorldBeforeEvents', names: WorldBeforeEventsManifest.properties },
  { scope: 'system.afterEvents', className: 'SystemAfterEvents', names: SystemAfterEventsManifest.properties },
  { scope: 'system.beforeEvents', className: 'SystemBeforeEvents', names: SystemBeforeEventsManifest.properties },
] as const satisfies readonly { scope: SignalScope; className: string; names: readonly string[] }[]

/** The four signal containers a bundle carries, with every declared signal already built. */
export interface SignalContainers {
  readonly worldAfterEvents: MC.WorldAfterEvents
  readonly worldBeforeEvents: MC.WorldBeforeEvents
  readonly systemAfterEvents: MC.SystemAfterEvents
  readonly systemBeforeEvents: MC.SystemBeforeEvents
}

/**
 * Builds every declared signal for a bundle and the four containers that expose them. Every signal
 * exists from the start, whether or not any fake behaviour raises it.
 */
export const createSignals = (server: ServerState): SignalContainers => {
  const containers: Record<string, object> = {}
  for (const { scope, className, names } of CONTAINERS) {
    const classNames: Readonly<Record<string, string | undefined>> = SIGNAL_CLASS_BY_CONTAINER[className] ?? {}
    for (const name of names) {
      const signalClass = classNames[name]
      if (signalClass === undefined) {
        continue
      }
      const state: SignalState = { scope, name, subscribers: new Set(), fake: {} }
      const fake = construct(signalClass, { data: { server, signal: state } satisfies SignalData })
      server.signals.set(signalKey(scope, name), { ...state, fake })
    }
    containers[className] = construct(className, { data: { server } satisfies ContainerData })
  }
  return {
    worldAfterEvents: containers.WorldAfterEvents as MC.WorldAfterEvents,
    worldBeforeEvents: containers.WorldBeforeEvents as MC.WorldBeforeEvents,
    systemAfterEvents: containers.SystemAfterEvents as MC.SystemAfterEvents,
    systemBeforeEvents: containers.SystemBeforeEvents as MC.SystemBeforeEvents,
  }
}

// ---------------------------------------------------------------------------
// Behaviour
// ---------------------------------------------------------------------------

/**
 * Subscription is set-shaped, as observed: subscribing the same function reference twice delivers
 * one call, and distinct subscribers run in subscription order.
 */
const signalBehaviour: ClassBehaviour = {
  subscribe: (fake: object, callback: (payload: never) => void, options?: unknown) => {
    // A filtered subscription is not modelled; honouring the call and dropping the filter would
    // deliver events the engine would have withheld.
    if (options !== undefined) {
      throw new NotImplementedError(`${stateOf(fake).className}.subscribe`)
    }
    dataOf<SignalData>(fake).signal.subscribers.add(callback)
    return callback
  },
  unsubscribe: (fake: object, callback: (payload: never) => void) => {
    dataOf<SignalData>(fake).signal.subscribers.delete(callback)
  },
}

for (const className of SIGNAL_CLASSES) {
  registerBehaviour(className, signalBehaviour)
}

for (const { scope, className, names } of CONTAINERS) {
  registerBehaviour(
    className,
    Object.fromEntries(names.map((name) => [name, (fake: object) => signalOf(serverOf(fake), scope, name)])),
  )
}

// ---------------------------------------------------------------------------
// Free functions
// ---------------------------------------------------------------------------

/** A signal object, as narrow as `emit` needs it: something a payload can be delivered to. */
export interface EmittableSignal<P> {
  subscribe: (callback: (payload: P) => void, ...rest: never[]) => unknown
}

/**
 * Delivers a payload to a signal's subscribers, exactly as given. This is how a test drives any
 * signal the fakes' own behaviour does not raise.
 */
export const emit = <P>(signal: EmittableSignal<P>, payload: P): void => {
  const { server, signal: state } = dataOf<SignalData>(signal)
  deliver(server, state.scope, state.name, payload)
}

/**
 * The errors thrown by subscribers and absorbed at dispatch, in the order they were thrown,
 * carrying the signal and the error itself. The engine discards these; a test that asserts no
 * handler failed reads them here.
 */
export const getHandlerErrors = (server: ServerLike): readonly HandlerError[] => serverOf(server.world).handlerErrors
