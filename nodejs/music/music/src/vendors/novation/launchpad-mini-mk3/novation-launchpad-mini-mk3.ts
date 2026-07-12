import { MidiDevice } from '../../../midi/midi-device.js'
import { get } from 'lodash-es'
import { logger } from '../../../logger.js'
import {
  CommandHeader,
  CommandTrailer,
  LaunchpadCommands,
  lookupCommand,
  type LaunchpadCommand,
  type LaunchpadCommandConfig,
  type LaunchpadCommandDataType,
  type Mode,
} from './commands/index.js'
import type { Sysex } from 'easymidi'
import { parseSysexMessage } from './sysex-messages.js'
import { parseSysex } from '../../../midi/sysex-message-parser.js'
import type { TypedEventEmitter } from '../../../typed-event-emitter.js'
import EventEmitter from 'node:events'
import type { IdentityResponseEvent, LaunchpadEventMap, ReadbackEvent } from './events.js'
import { setInterval } from 'node:timers'

export type LaunchpadEventEmitter = TypedEventEmitter<LaunchpadEventMap>

const log = logger.child({}, { msgPrefix: '[LAUNCHPAD] ' })

export class NovationLaunchpadMiniMk3 {
  private _events = new EventEmitter() as LaunchpadEventEmitter
  private _initializationLogsDisplayed = false
  public readonly _input: MidiDevice
  private _inputInitialized = false
  /**
   * The last known Mode the launchpad was in.
   */
  private _mode: Mode | undefined
  private _output: MidiDevice

  private _statsStartTime = 0
  private _bytesReceived = 0
  private _bytesSent = 0

  constructor({
    inputDeviceName = 'Launchpad Mini MK3 LPMiniMK3 MIDI Out',
    outputDeviceName = 'Launchpad Mini MK3 LPMiniMK3 MIDI In',
  }: {
    inputDeviceName?: string
    outputDeviceName?: string
  } = {}) {
    this._input = new MidiDevice({
      name: inputDeviceName,
      direction: 'input',
    })
    this._output = new MidiDevice({
      name: outputDeviceName,
      direction: 'output',
    })

    this._input.on('connected', () => {
      void this.onInputConnect()
    })
    this._output.on('connected', () => {
      void this.onOutputConnect()
    })

    this._input.on('disconnected', () => {
      this.onDisconnect(this._input.inputName)
    })
    this._output.on('disconnected', () => {
      this.onDisconnect(this._output.outputName)
    })

    this.events.on('readback', (event) => {
      if (event.command === 'select-mode') {
        const newMode = event.data[0] === 1 ? 'programmer' : 'live'
        if (newMode !== this._mode) {
          logger.info(`Mode changed. [newMode=${newMode}]`)

          this._mode = newMode
          this._events.emit('mode-changed', {
            eventType: 'mode-changed',
            mode: newMode,
          })
        }
      }
    })

    setInterval(() => {
      void this.sendReadback('select-mode')
    }, 3000)

    setInterval(() => {
      this._events.emit('midi-stats', {
        bytesReceived: this._bytesReceived,
        bytesSent: this._bytesSent,
        eventType: 'midi-stats',
        interval: Date.now() - this._statsStartTime,
      })
      this._statsStartTime = Date.now()
      this._bytesReceived = 0
      this._bytesSent = 0
    }, 15000)
    this._statsStartTime = Date.now()
  }

  /**
   * Callback which is invoked when the Launchpad's input device is (re)connected to USB.
   */
  private async onInputConnect(): Promise<void> {
    log.info(`Connected: ${this._input.inputName}`)

    if (!this._inputInitialized) {
      this._input.on('sysex', (sysex) => {
        this.onSysEx(sysex)
      })
      this._inputInitialized = true
    }

    await this.logDeviceData()
  }

  /**
   * Callback which is invoked when the Launchpad's output device is (re)connected to USB.
   */
  private async onOutputConnect(): Promise<void> {
    log.info(`Connected: ${this._output.outputName}`)
    await this.logDeviceData()
  }

  /**
   * Called when the system detects that the device was disconnected from the USB port.
   */
  private onDisconnect(name: string) {
    log.info(`Disconnected: ${name}`)
  }

  /**
   * Handler invoked when the Launchpad sends a SysEx message. Will attempt to parse it is a valid readback, and emit
   * the corresponding event. Logs a warning and discards the event otherwise.
   * @param data
   */
  private onSysEx({ bytes }: Sysex) {
    this._bytesReceived += bytes.length

    const result = parseSysex(bytes)
    if (!result.valid) {
      log.warn(
        { message: bytes.map((b) => `${b}`).join(', ') },
        `Received invalid SysEx message (${bytes.length} bytes)`,
      )
    } else if (result.message.source === 'universal') {
      // handle universal message
      if (result.message.type === 'identity-response') {
        this._events.emit('identity-response', {
          eventType: 'identity-response',
          message: result.message,
        })
      } else {
        logger.warn(
          { message: result.message },
          `Received unexpected universal SysEx message of type: ${result.message.type}`,
        )
      }
    } else {
      const message = parseSysexMessage(result.message)
      if (message.type === 'unknown') {
        log.warn(
          { message: bytes.map((b) => `${b}`).join(', ') },
          `Received unrecognized SysEx message (${bytes.length} bytes)`,
        )
      } else {
        const command = lookupCommand(message.command)
        log.debug(
          {
            command,
            data: bytes.map((b) => `0x${b.toString(16).padStart(2, '0')}`).join(', '),
          },
          `Received SysEx readback message for command: ${command?.name ?? message.command}`,
        )

        if (command === undefined) {
          log.warn(
            { message: bytes.map((b) => `${b}`).join(', ') },
            `Received SysEx message with unrecognized command code: ${message.command}`,
          )
        } else {
          this._events.emit('readback', {
            command: command.name as ReadbackEvent['command'],
            data: message.payload,
            eventType: 'readback',
          })
        }
      }
    }
  }

  private async logDeviceData() {
    // wait for both input & output devices
    if (this._input.state !== 'connected' || this._output.state !== 'connected') {
      return
    }

    if (!this._initializationLogsDisplayed) {
      try {
        const firmwareVersion = await this.getFirmwareVersion(5000)
        log.info(`Detected firmware version: ${firmwareVersion}`)
      } catch (err: unknown) {
        console.warn(`Failed to get firmware version: ${get(err, 'message', String(err))}`, err)
      }

      this._initializationLogsDisplayed = true
    }
  }

  public get events(): Omit<LaunchpadEventEmitter, 'emit'> {
    return this._events
  }

  public getFirmwareVersion(timeoutMs = 250): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._events.off('identity-response', handleResponse)
        reject(new Error(`Timeout waiting for device version. [${timeoutMs} ms]`))
      }, timeoutMs)

      const handleResponse = ({ message }: IdentityResponseEvent) => {
        clearTimeout(timeout)
        resolve(Number.parseInt(message.version.join(''), 10))
      }
      this._events.on('identity-response', handleResponse)
      this._output.send('sysex', [0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7])
    })
  }

  /**
   * Sends the specified SysEx command to the device. The data to send is not validated before sending.
   * @see - Launchpad Mini - Programmer's Referene Manual
   * @param command Name of the command to send.
   * @param data Command-specific data.
   */
  public sendCommand<C extends LaunchpadCommand = LaunchpadCommand>(
    command: C,
    data: LaunchpadCommandDataType<C>,
  ): Promise<void> {
    const commandConfig = LaunchpadCommands[command] as LaunchpadCommandConfig<LaunchpadCommandDataType<C>>
    const marshalledData = commandConfig.toBytes(data)

    const message = [...CommandHeader, commandConfig.code, ...marshalledData, ...CommandTrailer]

    log.debug({ data, message: message.map((b) => `${b}`).join(', ') }, `Sending command: ${command}`)

    this._bytesSent += message.length

    this._output.send('sysex', message)
    return Promise.resolve()
  }

  /**
   * Sends a readback request for the specified SysEx command to the device.
   * @see - Launchpad Mini - Programmer's Referene Manual
   * @param command Name of the command to send.
   */
  public sendReadback(command: LaunchpadCommand): Promise<void> {
    const commandConfig = LaunchpadCommands[command]
    const message = [...CommandHeader, commandConfig.code, ...CommandTrailer]

    log.debug({ message: message.map((b) => `${b}`).join(', ') }, `Sending readback: ${command}`)

    this._bytesSent += message.length

    this._output.send('sysex', message)
    return Promise.resolve()
  }
}
