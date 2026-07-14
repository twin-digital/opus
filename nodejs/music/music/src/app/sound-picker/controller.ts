import { logger } from '../../logger.js'
import type { MidiDevice } from '../../midi/midi-device.js'
import type { RgbColor } from '../../ui/color.js'
import { toChannelId, type ChannelId, type KeyboardRoute, type MidiChannel } from './model.js'
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
   * Routing table applied to incoming keyboard notes: a note sounds on every channel whose route matches it. Defaults
   * to one full-range route per channel, so the whole keyboard plays every channel.
   */
  private _routes: KeyboardRoute[]

  /**
   * Creates a new LaunchpadController.
   * @param instrument MIDI device being controlled by this instance.
   * @param samples Player used to sound samples on channels playing a sound board.
   * @param channelCount Number of channels to manage. Defaults to four.
   */
  constructor(
    private readonly instrument: MidiDevice,
    samples: SamplePlayer,
    channelCount = 4,
  ) {
    if (channelCount < 1 || channelCount > 8) {
      throw new Error(`The channelCount must be between 1 and 8, inclusive. [channelCount=${channelCount}]`)
    }

    this._channels = Array.from(
      { length: channelCount },
      (_, i) => new Channel(this.instrument, toChannelId(i), MidiChannels[i], samples, ChannelColors[i]),
    )
    this._routes = this._channels.map((channel) => ({ channelId: channel.id }))
  }

  private channelById(id: ChannelId): Channel | undefined {
    return this._channels.find((channel) => channel.id === id)
  }

  /**
   * Channels the routing table maps a keyboard note to. Deduplicated, so a note plays at most once per channel even
   * when several routes to the same channel match it.
   */
  private channelsForNote(note: number): Channel[] {
    const matched = this._routes
      .filter((route) => route.range === undefined || (note >= route.range.low && note <= route.range.high))
      .map((route) => this.channelById(route.channelId))
      .filter((channel) => channel !== undefined)

    return [...new Set(matched)]
  }

  private handleNoteOff(note: Note) {
    this.channelsForNote(note.note).forEach((channel) => {
      channel.stopNote(note)
    })
  }

  private handleNoteOn(note: Note) {
    this.channelsForNote(note.note).forEach((channel) => {
      // A note-on of velocity 0 is a key release, which bypasses mute (the channel routes it to stopNote): mute stops
      // sound from starting, never from stopping.
      if (note.velocity === 0 || !channel.muted) {
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

    // A fresh channel's level matches the piano only by luck — the instrument remembers the last CC 7 it was sent
    // across program switches and power cycles — so initialization writes each level out rather than assume it.
    this._channels.forEach((channel) => {
      channel.sendLevel()
    })

    // off-then-on keeps each listener registered exactly once, however many times the controller is re-initialized.
    this.instrument.off('noteon', this._noteOnListener)
    this.instrument.off('noteoff', this._noteOffListener)
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
   * Replaces the keyboard routing table. Routes govern keyboard input only — notes played programmatically on a
   * channel are unaffected. Notes already sounding are left alone; callers changing routes mid-note should also call
   * {@link stopAllSound} if stragglers would be wrong.
   */
  public setRoutes(routes: KeyboardRoute[]) {
    this._routes = [...routes]
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
