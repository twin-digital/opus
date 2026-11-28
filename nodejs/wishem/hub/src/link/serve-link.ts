import { HubConfigurationError } from '../errors.js'
import { isId } from '../names.js'
import type { Hub, HubEvent, JoinedState, Port, SubmitResult } from '../types.js'
import type { Channel } from './channel.js'
import { LINK_PROTOCOL_VERSION, parseClientMessage } from './messages.js'
import type { ClientMessage, HubMessage, RefusalReason } from './messages.js'

const assertNever = (event: never): never => {
  throw new Error(`The hub event is not handled: ${JSON.stringify(event)}`)
}

const KINDS: readonly string[] = ['input', 'output']

/** Serves one connection for a hub. Returns at once. The link ends when the channel closes. */
export const serveLink = (hub: Hub, channel: Channel): void => {
  const ports = new Map<string, Port>()
  let started = false
  let welcomed = false
  let stopping = false
  let closed = false
  let lastSent: JoinedState = {}
  let unsubscribe: (() => void) | undefined
  const waiting: HubMessage[] = []

  const shutdown = () => {
    if (closed) {
      return
    }
    closed = true
    unsubscribe?.()
    for (const port of ports.values()) {
      port.close()
    }
    ports.clear()
    try {
      channel.close()
    } catch {
      // The channel is closed already.
    }
  }

  const sendNow = (message: HubMessage) => {
    if (closed) {
      return
    }
    try {
      channel.send(JSON.stringify(message))
    } catch {
      shutdown()
    }
  }

  const send = (message: HubMessage) => {
    if (welcomed) {
      sendNow(message)
    } else {
      waiting.push(message)
    }
  }

  const refuse = (reason: RefusalReason, message: string, supported?: number[]) => {
    sendNow({ t: 'refused', reason, message, ...(supported === undefined ? {} : { supported }) })
    shutdown()
  }

  const changedParts = (state: JoinedState) => {
    const parts: Record<string, unknown> = {}
    for (const [key, part] of Object.entries(state)) {
      if (!(key in lastSent) || lastSent[key] !== part) {
        parts[key] = part
      }
    }
    return parts
  }

  const onEvent = (event: HubEvent) => {
    if (closed) {
      return
    }
    switch (event.type) {
      case 'started':
        send({ t: 'event', event: 'started' })
        break
      case 'applied': {
        const state = hub.read()
        send({ t: 'applied', input: event.input, parts: changedParts(state) })
        lastSent = state
        break
      }
      case 'stopping':
        stopping = true
        send({ t: 'event', event: 'stopping' })
        if (welcomed) {
          shutdown()
        }
        break
      default:
        return assertNever(event)
    }
  }

  const attachAll = (subsystems: { id: string; kind: string }[]): RefusalReason | undefined => {
    for (const subsystem of subsystems) {
      try {
        ports.set(subsystem.id, hub.attach({ id: subsystem.id, kind: subsystem.kind as 'input' | 'output' }))
      } catch (error) {
        return error instanceof HubConfigurationError ? 'id-in-use' : 'stopped'
      }
    }
    return undefined
  }

  const handleHello = (message: Extract<ClientMessage, { t: 'hello' }>) => {
    const { subsystems } = message
    if (message.protocol !== LINK_PROTOCOL_VERSION) {
      refuse('version', `The hub supports protocol version ${LINK_PROTOCOL_VERSION}, not ${message.protocol}.`, [
        LINK_PROTOCOL_VERSION,
      ])
      return
    }
    if (hub.status === 'stopped') {
      refuse('stopped', 'The hub is stopped.')
      return
    }
    // The check of the kind runs before the check of `model`, so `malformed` wins over `unsupported`.
    if (
      subsystems.length === 0 ||
      subsystems.some((s) => !isId(s.id) || !(KINDS.includes(s.kind) || s.kind === 'model'))
    ) {
      refuse('malformed', 'The list of subsystems is empty or not correct.')
      return
    }
    if (subsystems.some((s) => s.kind === 'model')) {
      refuse('unsupported', 'A subsystem of the kind model is not supported.')
      return
    }
    const reason = attachAll(subsystems)
    if (reason !== undefined) {
      refuse(reason, reason === 'stopped' ? 'The hub is stopped.' : 'A subsystem ID is in use.')
      return
    }

    started = true
    const [first] = ports.values()
    unsubscribe = first.subscribe(onEvent)
    const state = hub.read()
    lastSent = state
    sendNow({ t: 'welcome', protocol: LINK_PROTOCOL_VERSION, status: hub.status, seq: hub.seq, state })
    welcomed = true
    for (const queued of waiting.splice(0)) {
      sendNow(queued)
    }
    if (stopping) {
      shutdown()
    }
  }

  const handleSubmit = (message: Extract<ClientMessage, { t: 'submit' }>) => {
    const { request } = message
    const port = ports.get(message.subsystem)
    const finish =
      port?.submit(message.input) ?? Promise.resolve<SubmitResult>({ ok: false, reason: 'not-permitted', problems: [] })
    finish.then(
      (result) => {
        sendNow({ t: 'result', request, result })
      },
      (error: unknown) => {
        sendNow({ t: 'result', request, error: error instanceof Error ? error.message : String(error) })
      },
    )
  }

  const onMessage = (text: string) => {
    if (closed) {
      return
    }
    const parsed = parseClientMessage(text)
    if (parsed === undefined) {
      refuse('malformed', 'The message is not correct or is not the hello message.')
      return
    }
    const type = parsed.kind === 'unknown' ? parsed.t : parsed.message.t
    if (!started && type !== 'hello') {
      refuse('malformed', 'The message is not correct or is not the hello message.')
    } else if (parsed.kind === 'message') {
      const { message } = parsed
      if (message.t === 'submit') {
        handleSubmit(message)
      } else if (started) {
        refuse('malformed', 'The link has started already.')
      } else {
        handleHello(message)
      }
    }
  }

  const onBinary = () => {
    if (closed) {
      return
    }
    refuse('malformed', 'The message is binary. Send each message as a WebSocket text message.')
  }

  channel.onMessage(onMessage, onBinary)
  channel.onClose(shutdown)
}
