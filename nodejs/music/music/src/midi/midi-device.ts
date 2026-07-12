import EventEmitter from 'node:events'
import * as easymidi from 'easymidi'
import { type MidiEventMap, MidiEvents, type MidiParameterMap } from './midi-events.js'
import type { TypedEventEmitter } from '../typed-event-emitter.js'
import { MidiDeviceWatcher } from './midi-device-watcher.js'
import pino from 'pino'
import { logger } from '../logger.js'

// combine the built-in connection events + the MIDI callbacks
type AllEvents = {
  connected: () => void
  disconnected: () => void
  error: () => void
} & MidiEventMap

export class MidiDevice extends (EventEmitter as new () => TypedEventEmitter<AllEvents>) {
  private direction: 'duplex' | 'input' | 'output'
  public readonly inputName: string
  private input?: easymidi.Input
  public readonly outputName: string
  private output?: easymidi.Output
  private log: pino.Logger
  private _state: 'connected' | 'disconnected' | 'error' = 'disconnected'
  private createDeviceHandle: ReturnType<typeof setTimeout> | undefined
  private watcher: MidiDeviceWatcher

  constructor({
    name,
    direction = 'duplex',
    pollIntervalMs = 100,
  }: {
    name:
      | string
      | {
          input: string
          output: string
        }
    direction?: 'duplex' | 'input' | 'output'
    pollIntervalMs?: number
  }) {
    super()

    this.log = logger

    this.inputName = typeof name === 'string' ? name : name.input
    this.outputName = typeof name === 'string' ? name : name.output

    this.direction = direction
    this.watcher = new MidiDeviceWatcher({
      devicesToWatch: [this.inputName, this.outputName],
      pollIntervalMs,
    })

    const setState = (state: 'connected' | 'disconnected' | 'error') => () => {
      this.log.debug(`state === ${state}`)
      this._state = state
    }

    this.on('connected', setState('connected'))
    this.on('disconnected', setState('disconnected'))
    this.on('error', setState('error'))

    this.watcher.on('found', this.connect.bind(this)).on('lost', this.disconnect.bind(this)).start()

    this.log.debug('Started DeviceWatcher.')
  }

  private tryCreateDevice() {
    try {
      if (['duplex', 'input'].includes(this.direction) && this.input === undefined) {
        this.input = new easymidi.Input(this.inputName)
        this.hookAllEvents()
      }

      if (['duplex', 'output'].includes(this.direction) && this.output === undefined) {
        this.output = new easymidi.Output(this.outputName)
      }

      this.emit('connected')
    } catch (_) {
      this.createDeviceHandle = setTimeout(this.tryCreateDevice.bind(this), 100)

      this.emit('error')
    }
  }

  private connect() {
    this.log.debug('Received event from DeviceWatcher: found')

    if (this.state === 'connected') {
      // already connected
      return
    }

    // easymidi reconnects if the device is already created, so we just set our connection state
    const needsInputConnect = this.input === undefined && ['duplex', 'input'].includes(this.direction)
    const needsOutputConnect = this.output === undefined && ['duplex', 'output'].includes(this.direction)

    if (needsInputConnect || needsOutputConnect) {
      this.tryCreateDevice()
    } else {
      this.emit('connected')
    }
  }

  private disconnect() {
    this.log.debug('Received event from DeviceWatcher: lost')

    if (this.state === 'disconnected') {
      // already disconnected
      return
    }

    // stop trying to create the device
    if (this.createDeviceHandle) {
      clearTimeout(this.createDeviceHandle)
    }

    this.emit('disconnected')
  }

  /** for input devices only */
  private hookAllEvents() {
    if (this.direction === 'output' || this.input === undefined) {
      return
    }

    for (const event of MidiEvents) {
      const listener = ((...args: Parameters<MidiEventMap[typeof event]>) => {
        this.emit(event, ...args)
      }) as MidiEventMap[typeof event]

      this.input.on(event, listener)
    }
  }

  public override on<E extends keyof AllEvents>(event: E, listener: AllEvents[E]): this {
    super.on(event, listener)

    this.log.debug(`Registering listener for event: ${event}`)

    // if they’re listening for "connected" *and* we already are... resend, so that clients can perform "on-connect"
    // initialization reliably
    if (event === 'connected' && this._state === 'connected') {
      this.log.debug(`Sending immediate 'connected' event for new listener.`)

      // schedule it async so it looks just like a normal event
      setImmediate(listener as () => void)
    } else if (event === 'connected') {
      this.log.debug(`Not connected when adding new 'connected' listener. [state=${this._state}]`)
    }

    return this
  }

  /** for output devices only */
  public send = <E extends keyof MidiParameterMap>(evt: E, arg: MidiParameterMap[E]) => {
    if (this.output) {
      const output = this.output
      output.send(evt, arg)
    }
  }

  public get state(): 'connected' | 'disconnected' | 'error' {
    return this._state
  }
}
