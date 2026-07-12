import type { Channel, Note } from 'easymidi'
import type { MidiDevice } from '../../midi/midi-device.js'
import { logger } from '../../logger.js'
import { currentTimeMillis } from '../../engine/timer.js'

const log = logger.child({}, { msgPrefix: '[INPUT] ' })

interface CurrentNote {
  startTime: number
  value: number
}

export class ChallengeInputHandler {
  private noteOffHandler: (event: Note) => void
  private noteOnHandler: (event: Note) => void
  private currentNote: CurrentNote | undefined
  private state: 'stopped' | 'running' = 'stopped'

  public constructor(
    private readonly midi: MidiDevice,
    private readonly inputChannel: Channel,
    private readonly echoChannel: Channel,
    private readonly onNote: (note: number, duration: number) => Promise<void> | void,
  ) {
    this.noteOffHandler = this.handleNoteOff.bind(this)
    this.noteOnHandler = this.handleNoteOn.bind(this)
  }

  private handleNoteOff(note: Note) {
    this.midi.send('noteoff', {
      ...note,
      channel: this.echoChannel,
    })

    if (this.inputChannel === note.channel && this.currentNote?.value === note.note && this.state === 'running') {
      const duration = currentTimeMillis() - this.currentNote.startTime

      log.info(`Received input note. [note=${note.note}, duration=${duration}]`)

      const value = this.currentNote.value
      this.currentNote = undefined
      void this.onNote(value, duration)
    }
  }

  private handleNoteOn(note: Note) {
    if (this.state === 'stopped') {
      log.info(`Received noteon while "stopped". [channel=${note.channel}, note=${note.note}]`)
      return
    }

    if (this.inputChannel === note.channel) {
      if (!this.isPlaying) {
        this.midi.send('noteon', {
          ...note,
          channel: this.echoChannel,
        })

        this.currentNote = {
          startTime: currentTimeMillis(),
          value: note.note,
        }
      }
    }
  }

  public get isPlaying() {
    return this.currentNote !== undefined
  }

  private setState(state: 'stopped' | 'running') {
    log.info(`Setting input controller state: ${state}`)
    this.state = state
    this.currentNote = undefined
  }

  public start() {
    if (this.state === 'stopped') {
      this.midi.on('noteoff', this.noteOffHandler)
      this.midi.on('noteon', this.noteOnHandler)

      this.setState('running')
    }
  }

  public stop() {
    if (this.state !== 'stopped') {
      this.midi.off('noteoff', this.noteOffHandler)
      this.midi.off('noteon', this.noteOnHandler)

      this.setState('stopped')
    }
  }
}
