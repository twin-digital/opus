import type pino from 'pino'
import type { Note } from 'easymidi'
import type { MidiDevice } from '../../midi/midi-device.js'
import type { RgbColor } from '../../ui/color.js'
import type { ChannelId, MidiChannel } from './model.js'
import type { Instrument } from '../../midi/instrument-data.js'
import type { SamplePlayer } from '../../audio/sample-player.js'
import type { SoundBoard } from '../../soundboard/model.js'
import { logger } from '../../logger.js'
import { normalizeMidiByte } from '../../midi/normalize-midi-byte.js'
import { getSampleForNote, isSoundBoard } from '../../soundboard/model.js'
import { SoundBoardsByInstrumentId } from '../../soundboard/sound-boards.js'

export class Channel {
  /**
   * Sound board currently selected on this channel, or `undefined` when the channel plays a MIDI patch.
   */
  private _board: SoundBoard | undefined

  /**
   * Current volume level for this channel.
   */
  private _level = 127

  private _log: pino.Logger

  /**
   * Whether this channel is currently muted or not.
   */
  private _muted = false

  public constructor(
    /**
     * Output MIDI device on which to play notes and update control or program values.
     */
    private _device: MidiDevice,

    /**
     * Identifies this channel to the UI. Its position in the controller's channel list, and unrelated to the MIDI
     * channel the notes happen to travel on.
     */
    private _id: ChannelId,

    /**
     * MIDI channel number (0-15) this instance transmits on.
     */
    private _midiChannel: MidiChannel,

    /**
     * Color used for UI elements assocaited with this channel.
     */
    private _color: RgbColor = [127, 127, 127],

    /**
     * Player used to sound samples when a sound board is selected. Required: a channel that could bind a board but
     * had no way to sound it would swallow every key press, playing neither a sample nor a note on the piano.
     */
    private _samples: SamplePlayer,
  ) {
    // Both numbers are logged: the id is what the UI and the controller's API speak, and the MIDI channel is what
    // shows up on the wire.
    this._log = logger.child({}, { msgPrefix: `[CHANNEL#${this.id} midi=${this.midiChannel}] ` })
  }

  /**
   * Sounds a note on this channel. A MIDI patch is played by echoing the note to the piano, which renders it; a sound
   * board is played by sounding the sample mapped to the key, and the note is not echoed.
   */
  public playNote(note: Note) {
    // A note-on of velocity 0 is how many keyboards signal a key release, and easymidi surfaces it as it arrives
    // rather than converting it. Treating it as a release here keeps both paths honest: a sound board would otherwise
    // answer it by starting a sample at zero gain — inaudible, but a real voice held for the sample's full length, one
    // per key release — and, worse, would swallow the release of a note the piano is still holding from before the
    // board was selected.
    if (note.velocity === 0) {
      this.stopNote(note)
      return
    }

    if (this._board !== undefined) {
      this._samples.play(getSampleForNote(this._board, note.note), note.velocity, this.level, this)
      return
    }

    this._device.send('noteon', {
      ...note,
      channel: this.midiChannel,
    })
  }

  /**
   * Releases a note on this channel.
   *
   * The note-off is sent even when a sound board is selected. A board's own samples are one-shots with nothing to
   * release, but a board can be selected while a MIDI note is still held down — the key that was struck before the
   * switch still has to be let go, or it sustains on the piano forever.
   */
  public stopNote(note: Note) {
    this._device.send('noteoff', {
      ...note,
      channel: this.midiChannel,
    })
  }

  /**
   * Mutes all sounds currently playing on this channel. This does not mute the channel, so if new notes are played
   * sound will resume as normal.
   */
  public stopAllSound() {
    this._samples.stopAll(this)

    this._device.send('cc', {
      channel: this.midiChannel,
      controller: 0x78,
      value: 0,
    })
  }

  /**
   * Selects the sound played by notes on this channel.
   *
   * A sound board is not a patch on the piano, so selecting one binds the board to this channel and sends no program
   * change; the piano is silenced instead, since it renders none of the board's notes.
   * @param instrument Instrument to select.
   */
  public selectSound(instrument: Instrument) {
    // Whatever is selected next, this channel's samples stop now. Otherwise leaving a board would leave its one-shots
    // ringing with nothing left holding a reference to stop them — a multi-second sample would play on over the top of
    // the patch that replaced it.
    this._samples.stopAll(this)

    if (isSoundBoard(instrument)) {
      const board = SoundBoardsByInstrumentId[instrument.id]
      if (board === undefined) {
        this._log.warn(`Ignored a sound-board instrument that maps to no board. [instrument=${instrument.id}]`)
        return
      }

      this._board = board
      this.stopAllSound()
      void this._samples.load(board.samples)

      this._log.info(`Selected sound board: ${instrument.name}`)
      return
    }

    this._board = undefined

    this._device.send('cc', {
      channel: this.midiChannel,
      controller: 0,
      value: instrument.bank.msb,
    })
    this._device.send('cc', {
      channel: this.midiChannel,
      controller: 32,
      value: instrument.bank.lsb,
    })

    this._device.send('program', {
      channel: this.midiChannel,
      number: instrument.patch,
    })

    this._log.info({}, `Sent program change: ${instrument.patch}`)
  }

  public get color() {
    return this._color
  }

  public get id(): ChannelId {
    return this._id
  }

  public get level() {
    return this._level
  }

  public set level(newValue: number) {
    const normalizedValue = normalizeMidiByte(newValue)
    if (this.level !== normalizedValue) {
      this._level = normalizedValue
      this._device.send('cc', {
        controller: 0x07,
        value: this.level,
        channel: this.midiChannel,
      })

      this._log.info(`Set level to ${normalizedValue}`)
    } else {
      this._log.debug(`Ignored attempt to set level, because the value did not change. [newValue=${normalizedValue}]`)
    }
  }

  public get midiChannel() {
    return this._midiChannel
  }

  public get muted() {
    return this._muted
  }

  public set muted(newValue: boolean) {
    if (this.muted !== newValue) {
      this._muted = newValue
      this._log.info(`${newValue ? 'Muted' : 'Unmuted'} channel.`)
    } else {
      this._log.debug(`Ignored attempt to set muted, because the value did not change. [newValue=${newValue}]`)
    }
  }
}
