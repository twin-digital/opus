import { Input, Output } from '@julusian/midi'
import EventEmitter from 'node:events'
import type { TypedEventEmitter } from '../typed-event-emitter.js'
import { logger } from '../logger.js'
import { randomUUID } from 'node:crypto'
import { listNumberedPortNames } from './port-names.js'

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type DeviceConnectionStateEventMap = {
  found: (name: string) => void
  lost: (name: string) => void
}

// Enumerating via easymidi.getInputs()/getOutputs() constructs a new native MIDI client on
// every call and permanently leaks it (dinchak/node-easymidi#51: the native constructor pins
// its message callback, so neither closePort() nor GC ever frees the client). The watcher
// polls continuously, so it enumerates through a single long-lived client pair instead —
// port enumeration reflects live hot-plug state on an existing client. Created lazily so
// merely importing this module doesn't open MIDI clients.
let enumerationClients: { input: Input; output: Output } | undefined

const getEnumerationClients = () => {
  if (enumerationClients === undefined) {
    // Assign only once both constructions succeed: RtMidi constructors throw on backend
    // failure, and a half-constructed pair would orphan the Input (its pinned native
    // callback makes it uncollectable without destroy()).
    const input = new Input()
    try {
      enumerationClients = { input, output: new Output() }
    } catch (error) {
      input.destroy()
      throw error
    }
  }
  return enumerationClients
}

export type MidiDeviceEventEmitter = TypedEventEmitter<DeviceConnectionStateEventMap>

export class MidiDeviceWatcher extends (EventEmitter as new () => MidiDeviceEventEmitter) {
  private filter: string[] | undefined
  private log = logger.child(
    {},
    {
      msgPrefix: `[WATCHER] ${randomUUID().slice(0, 6)} `,
    },
  )

  private pollIntervalMs: number
  private running = false
  private seen = new Set<string>()
  private handle?: NodeJS.Timeout

  constructor(options: { devicesToWatch?: string[]; pollIntervalMs?: number }) {
    super()

    this.log.debug('Creating.')
    this.filter = options.devicesToWatch
    this.pollIntervalMs = options.pollIntervalMs ?? 500
  }

  start() {
    if (this.running) {
      return
    }

    this.log.debug('Starting.')
    this.running = true
    this.tick()
  }

  stop() {
    this.log.debug('Stopping.')
    this.running = false
    clearTimeout(this.handle)
    this.handle = undefined
  }

  private tick() {
    const now = Date.now()

    try {
      const { input, output } = getEnumerationClients()
      const all = new Set([...listNumberedPortNames(input), ...listNumberedPortNames(output)])
      const wanted = this.filter ? new Set([...all].filter((d) => this.filter?.includes(d))) : all

      // newly found
      for (const d of wanted) {
        if (!this.seen.has(d)) {
          this.log.debug(`found ${d}`)

          this.seen.add(d)
          this.emit('found', d)
        }
      }

      // disconnected
      for (const d of [...this.seen]) {
        if (!wanted.has(d)) {
          this.log.debug(`lost ${d}`)

          this.seen.delete(d)
          this.emit('lost', d)
        }
      }
    } catch (error) {
      // a transient MIDI-backend error degrades to a skipped poll, not a dead watcher
      this.log.warn(error, 'Port enumeration failed; will retry on the next poll.')
    }

    // schedule next — unless stop() was called (possibly from a found/lost listener)
    if (this.running) {
      this.handle = setTimeout(this.tick.bind(this), Math.max(0, this.pollIntervalMs - (Date.now() - now)))
    }
  }
}
