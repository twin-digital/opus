import { logger } from '../../logger.js'
import type { MidiDevice } from '../../midi/midi-device.js'
import type { RgbColor } from '../../ui/color.js'
import { toChannelId, type ChannelId, type MidiChannel } from './model.js'
import { Channel } from './channel.js'
import type { Note } from 'easymidi'
import type { SamplePlayer } from '../../audio/sample-player.js'
import type { Instrument } from '../../midi/instrument-data.js'

const _log = logger.child({}, { msgPrefix: '[APP] ' })

/**
 * Default display colors for our channels. Used for UI controls such as faders.
 */
const ChannelColors: RgbColor[] = [
  [0, 0, 127],
  [127, 127, 0],
  [127, 0, 127],
  [0, 127, 127],
  [67, 103, 125],
  [85, 127, 97],
  [100, 80, 127],
  [127, 63, 51],
]

/**
 * MIDI channel numbers to assign to our virtual channels. Neither zero-based nor contiguous — 9 is skipped, being the
 * General MIDI percussion channel — which is why channels are addressed by `ChannelId` rather than by this number.
 */
const MidiChannels = [3, 4, 5, 6, 7, 8, 10, 11] satisfies MidiChannel[]

export class LaunchpadController {
  /**
   * Set of channels managed by this controller.
   */
  private _channels: Channel[]

  /**
   * Bound listener for 'noteoff' events, which can be added and removed to a device as needed.
   */
  private _noteOffListener = this.handleNoteOff.bind(this)

  /**
   * Bound listener for 'noteon' events, which can be added and removed to a device as needed.
   */
  private _noteOnListener = this.handleNoteOn.bind(this)

  /**
   * Creates a new LaunchpadController.
   * @param instrument MIDI device being controlled by this instance.
   * @param channelCount Number of channels to manage. Defaults to four.
   * @param samples Player used to sound samples on channels playing a sound board.
   */
  constructor(
    private readonly instrument: MidiDevice,
    channelCount = 4,
    samples: SamplePlayer,
  ) {
    if (channelCount < 1 || channelCount > 8) {
      throw new Error(`The channelCount must be between 1 and 8, inclusive. [channelCount=${channelCount}]`)
    }

    this._channels = Array.from(
      { length: channelCount },
      (_, i) => new Channel(this.instrument, toChannelId(i), MidiChannels[i], ChannelColors[i], samples),
    )
  }

  private channelById(id: ChannelId): Channel | undefined {
    return this._channels.find((channel) => channel.id === id)
  }

  private handleNoteOff(note: Note) {
    this._channels.forEach((channel) => {
      channel.stopNote(note)
    })
  }

  private handleNoteOn(note: Note) {
    this._channels.forEach((channel) => {
      if (!channel.muted) {
        channel.playNote(note)
      }
    })
  }

  /**
   * Initialize the controller. This method initiates the instrument connection, causing the controller to begin
   * receiving and sending audio messages.
   */
  public initialize() {
    this.stopAllSound()

    this.instrument.on('noteon', this._noteOnListener)
    this.instrument.on('noteoff', this._noteOffListener)
  }

  public shutdown() {
    this.stopAllSound()

    this.instrument.off('noteon', this._noteOnListener)
    this.instrument.off('noteoff', this._noteOffListener)
  }

  public get channels(): readonly Readonly<Channel>[] {
    return this._channels
  }

  /**
   * Mutes all sounds currently playing. If an optional channel id is provided, only that channel will be muted.
   * This does not mute the channels, so if new notes are played sound will resume as normal.
   * @param channelId ID of the channel in the controller's channel list. If not set, then all channels will be muted.
   */
  public stopAllSound(channelId?: ChannelId) {
    if (channelId !== undefined) {
      this.channelById(channelId)?.stopAllSound()
    } else {
      this.channels.forEach((channel) => {
        channel.stopAllSound()
      })
    }
  }

  /**
   * Sets the muted status for the channel with the specified ID.
   * @param channelId ID of the channel which should have its mute state updated.
   * @param muted
   */
  public setMuted(channelId: ChannelId, muted: boolean) {
    const channel = this.channelById(channelId)
    if (channel) {
      channel.muted = muted
    }
  }

  /**
   * Sets the level (volume) for the channel with the specified ID.
   * @param channelId ID of the channel which should have its mute state updated.
   * @param level Level to set for the channel, in the range 0-127. Will be clamped to that range. Non-integers will be
   *    rounded to the nearest integer.
   */
  public setLevel(channelId: ChannelId, level: number) {
    const channel = this.channelById(channelId)
    if (channel) {
      channel.level = level
    }
  }

  /**
   * Selects the sound played by notes on a specified channel.
   * @param channelId ID of the channel which should have its sound changed.
   * @param instrument Instrument to select. A sound board is sounded by the app; anything else is played by the piano.
   */
  public selectSound(channelId: ChannelId, instrument: Instrument) {
    this.channelById(channelId)?.selectSound(instrument)
  }
}
