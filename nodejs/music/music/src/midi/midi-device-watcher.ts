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
  enumerationClients ??= { input: new Input(), output: new Output() }
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
  private seen = new Set<string>()
  private handle?: NodeJS.Timeout

  constructor(options: { devicesToWatch?: string[]; pollIntervalMs?: number }) {
    super()

    this.log.debug('Creating.')
    this.filter = options.devicesToWatch
    this.pollIntervalMs = options.pollIntervalMs ?? 500
  }

  start() {
    this.log.debug('Starting.')
    this.tick()
  }

  stop() {
    this.log.debug('Stopping.')
    clearTimeout(this.handle)
  }

  private tick() {
    const now = Date.now()
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

    // schedule next
    this.handle = setTimeout(this.tick.bind(this), Math.max(0, this.pollIntervalMs - (Date.now() - now)))
  }
}
