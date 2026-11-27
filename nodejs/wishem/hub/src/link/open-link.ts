import type { HubEvent, Input, IoSubsystem, JoinedState, Port, SubmitResult } from '../types.js'
import type { Channel } from './channel.js'
import { LINK_PROTOCOL_VERSION, parseHubMessage } from './messages.js'
import type { HubMessage, RefusalReason } from './messages.js'

export interface OpenLinkOptions {
  /** Gets each error that a listener throws. */
  onError?: (error: unknown) => void
}

export interface RemoteLink {
  readonly ports: Readonly<Record<string, Port>>
  readonly closed: Promise<void>
  close(): void
}

export class LinkRefusedError extends Error {
  readonly reason: RefusalReason
  readonly supported?: number[]

  constructor(reason: RefusalReason, message: string, supported?: number[]) {
    super(message)
    this.name = 'LinkRefusedError'
    this.reason = reason
    this.supported = supported
  }
}

export class LinkClosedError extends Error {
  constructor(message = 'The link is closed.') {
    super(message)
    this.name = 'LinkClosedError'
  }
}

interface Registration {
  listener: (event: HubEvent) => void
}

interface PortState {
  registrations: Set<Registration>
  closed: boolean
}

interface Pending {
  resolve: (result: SubmitResult) => void
  reject: (error: Error) => void
}

const deepFreeze = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value).forEach(deepFreeze)
  }
  return value
}

const rejection = (reason: 'not-permitted' | 'not-running'): SubmitResult => ({ ok: false, reason, problems: [] })

/**
 * Starts a link on a channel and gives one remote port for each subsystem.
 * Rejects with a `LinkRefusedError` when the hub side refuses, and with a `LinkClosedError` when the channel closes first.
 */
export const openLink = async (
  channel: Channel,
  subsystems: readonly IoSubsystem[],
  options: OpenLinkOptions = {},
): Promise<RemoteLink> => {
  if (subsystems.length === 0) {
    throw new Error('The list of subsystems is empty.')
  }
  if (new Set(subsystems.map((subsystem) => subsystem.id)).size !== subsystems.length) {
    throw new Error('Two subsystems have one ID.')
  }
  const list = subsystems.map(({ id, kind }) => ({ id, kind }))

  return new Promise<RemoteLink>((resolveOpen, rejectOpen) => {
    let started = false
    let ended = false
    let state: JoinedState = {}
    let expectedSeq = 0
    let lastRequest = 0
    const pending = new Map<number, Pending>()
    const portStates = new Map<string, PortState>()
    let resolveClosed = (): void => undefined
    const closed = new Promise<void>((resolve) => {
      resolveClosed = resolve
    })

    const reportError = (error: unknown) => {
      try {
        options.onError?.(error)
      } catch {
        // A failing onError changes nothing.
      }
    }

    const closeChannel = () => {
      try {
        channel.close()
      } catch {
        // The channel is closed already.
      }
    }

    const end = () => {
      if (ended) {
        return
      }
      ended = true
      closeChannel()
      const waiting = [...pending.values()]
      pending.clear()
      for (const { reject } of waiting) {
        reject(new LinkClosedError())
      }
      resolveClosed()
    }

    const emit = (event: HubEvent) => {
      for (const portState of [...portStates.values()]) {
        for (const registration of [...portState.registrations]) {
          if (ended) {
            return
          }
          if (!portState.registrations.has(registration)) {
            continue
          }
          try {
            registration.listener(event)
          } catch (error) {
            reportError(error)
          }
        }
      }
    }

    const makePort = (subsystem: IoSubsystem): Port => {
      const identity = Object.freeze({ id: subsystem.id, kind: subsystem.kind })
      const portState: PortState = { registrations: new Set(), closed: false }
      portStates.set(identity.id, portState)
      return {
        subsystem: identity,
        read: () => state,
        subscribe: (listener) => {
          const registration = { listener }
          portState.registrations.add(registration)
          return () => {
            portState.registrations.delete(registration)
          }
        },
        close: () => {
          portState.closed = true
          portState.registrations.clear()
        },
        submit: (input: Input) => {
          if (identity.kind !== 'input' || portState.closed) {
            return Promise.resolve(rejection('not-permitted'))
          }
          if (ended) {
            return Promise.resolve(rejection('not-running'))
          }
          let text: string
          try {
            text = JSON.stringify({ t: 'submit', request: lastRequest + 1, subsystem: identity.id, input })
          } catch (error) {
            return Promise.reject(error instanceof Error ? error : new Error(String(error)))
          }
          lastRequest += 1
          const request = lastRequest
          return new Promise<SubmitResult>((resolve, reject) => {
            pending.set(request, { resolve, reject })
            try {
              channel.send(text)
            } catch {
              end()
            }
          })
        },
      }
    }

    const onApplied = (message: Extract<HubMessage, { t: 'applied' }>) => {
      if (message.input.seq !== expectedSeq) {
        end()
        return
      }
      expectedSeq += 1
      state = Object.freeze({ ...state, ...message.parts })
      emit({ type: 'applied', input: deepFreeze(message.input) })
    }

    const onResult = (message: Extract<HubMessage, { t: 'result' }>) => {
      const waiting = pending.get(message.request)
      if (waiting === undefined) {
        return
      }
      pending.delete(message.request)
      if (message.error === undefined) {
        waiting.resolve(message.result as SubmitResult)
      } else {
        waiting.reject(new Error(message.error))
      }
    }

    const onStart = (message: HubMessage | { unknown: true } | undefined) => {
      if (message === undefined || 'unknown' in message || (message.t !== 'welcome' && message.t !== 'refused')) {
        ended = true
        closeChannel()
        rejectOpen(new LinkClosedError('The hub side sent no welcome message.'))
        return
      }
      if (message.t === 'refused') {
        ended = true
        closeChannel()
        rejectOpen(new LinkRefusedError(message.reason, message.message, message.supported))
        return
      }
      started = true
      state = Object.freeze({ ...message.state })
      expectedSeq = message.seq + 1
      resolveOpen({
        ports: Object.freeze(Object.fromEntries(list.map((subsystem) => [subsystem.id, makePort(subsystem)]))),
        closed,
        close: end,
      })
    }

    channel.onMessage((text) => {
      if (ended) {
        return
      }
      const message = parseHubMessage(text)
      if (!started) {
        onStart(message)
        return
      }
      if (message === undefined) {
        end()
      } else if ('unknown' in message) {
        return
      } else if (message.t === 'applied') {
        onApplied(message)
      } else if (message.t === 'result') {
        onResult(message)
      } else if (message.t === 'event') {
        emit({ type: message.event })
      }
    })
    channel.onClose(() => {
      if (started) {
        end()
      } else {
        ended = true
        rejectOpen(new LinkClosedError())
      }
    })

    channel.send(JSON.stringify({ t: 'hello', protocol: LINK_PROTOCOL_VERSION, subsystems: list }))
  })
}
