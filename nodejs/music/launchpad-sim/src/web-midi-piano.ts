/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { Note, Program } from 'easymidi'
import Soundfont, { type Player, type InstrumentName } from 'soundfont-player'
import { Events } from '@thrashplay/music/typed-event-emitter'

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type NoteEventMap = {
  noteon: (msg: Note) => void
  noteoff: (msg: Note) => void
  program: (msg: Program) => void
}

export class WebMidiPiano {
  // — static lookup from MIDI program number (0–127) to Soundfont.js instrument names —
  private static PROGRAM_TO_INSTRUMENT: Record<number, InstrumentName> = {
    0: 'acoustic_grand_piano',
    1: 'bright_acoustic_piano',
    2: 'electric_grand_piano',
    3: 'honkytonk_piano',
    4: 'electric_piano_1',
    5: 'electric_piano_2',
    6: 'harpsichord',
    7: 'clavinet',
    8: 'celesta',
    9: 'glockenspiel',
    10: 'music_box',
    11: 'vibraphone',
    12: 'marimba',
    13: 'xylophone',
    14: 'tubular_bells',
    15: 'dulcimer',
    16: 'drawbar_organ',
    17: 'percussive_organ',
    18: 'rock_organ',
    19: 'church_organ',
    20: 'reed_organ',
    21: 'accordion',
    22: 'harmonica',
    23: 'tango_accordion',
    24: 'acoustic_guitar_nylon',
    25: 'acoustic_guitar_steel',
    26: 'electric_guitar_jazz',
    27: 'electric_guitar_clean',
    28: 'electric_guitar_muted',
    29: 'overdriven_guitar',
    30: 'distortion_guitar',
    31: 'guitar_harmonics',
    32: 'acoustic_bass',
    33: 'electric_bass_finger',
    34: 'electric_bass_pick',
    35: 'fretless_bass',
    36: 'slap_bass_1',
    37: 'slap_bass_2',
    38: 'synth_bass_1',
    39: 'synth_bass_2',
    40: 'violin',
    41: 'viola',
    42: 'cello',
    43: 'contrabass',
    44: 'tremolo_strings',
    45: 'pizzicato_strings',
    46: 'orchestral_harp',
    47: 'timpani',
    48: 'string_ensemble_1',
    49: 'string_ensemble_2',
    50: 'synth_strings_1',
    51: 'synth_strings_2',
    52: 'choir_aahs',
    53: 'voice_oohs',
    54: 'synth_voice' as InstrumentName,
    55: 'orchestra_hit',
    56: 'trumpet',
    57: 'trombone',
    58: 'tuba',
    59: 'muted_trumpet',
    60: 'french_horn',
    61: 'brass_section',
    62: 'synth_brass_1',
    63: 'synth_brass_2',
    64: 'soprano_sax',
    65: 'alto_sax',
    66: 'tenor_sax',
    67: 'baritone_sax',
    68: 'oboe',
    69: 'english_horn',
    70: 'bassoon',
    71: 'clarinet',
    72: 'piccolo',
    73: 'flute',
    74: 'recorder',
    75: 'pan_flute',
    76: 'blown_bottle',
    77: 'shakuhachi',
    78: 'whistle',
    79: 'ocarina',
    80: 'lead_1_square',
    81: 'lead_2_sawtooth',
    82: 'lead_3_calliope',
    83: 'lead_4_chiff',
    84: 'lead_5_charang',
    85: 'lead_6_voice',
    86: 'lead_7_fifths',
    87: 'lead_8_bass_lead' as InstrumentName,
    88: 'pad_1_new_age',
    89: 'pad_2_warm',
    90: 'pad_3_polysynth',
    91: 'pad_4_choir',
    92: 'pad_5_bowed',
    93: 'pad_6_metallic',
    94: 'pad_7_halo',
    95: 'pad_8_sweep',
    96: 'fx_1_rain',
    97: 'fx_2_soundtrack',
    98: 'fx_3_crystal',
    99: 'fx_4_atmosphere',
    100: 'fx_5_brightness',
    101: 'fx_6_goblins',
    102: 'fx_7_echoes',
    103: 'fx_8_sci_fi' as InstrumentName,
    104: 'sitar',
    105: 'banjo',
    106: 'shamisen',
    107: 'koto',
    108: 'kalimba',
    109: 'bagpipe',
    110: 'fiddle',
    111: 'shanai',
    112: 'tinkle_bell',
    113: 'agogo',
    114: 'steel_drums',
    115: 'woodblock',
    116: 'taiko_drum',
    117: 'melodic_tom',
    118: 'synth_drum',
    119: 'reverse_cymbal',
    120: 'guitar_fret_noise',
    121: 'breath_noise',
    122: 'seashore',
    123: 'bird_tweet',
    124: 'telephone_ring',
    125: 'helicopter',
    126: 'applause',
    127: 'gunshot',
  }

  // typed emitter under the hood
  private emitter = new Events<NoteEventMap>()

  // AudioContext + tracking active nodes so we can stop each note
  private audioCtx = new (window.AudioContext ?? (window as any).webkitAudioContext)()
  private activeNodes = new Map<number, { node: any }>()

  // Track which program each channel is using (default = 0)
  private channelPrograms = new Map<number, number>()

  // Cache a Soundfont.js Player per channel
  private programPlayers = new Map<number, Player>()

  // Mapping from MIDI note number → HTML element (for highlighting)
  private keyElements = new Map<number, HTMLElement>()

  // The notes for one octave (C4=60 up to C5=72)
  private readonly whiteNotes = [60, 62, 64, 65, 67, 69, 71, 72]
  private readonly blackNotes = [61, 63, 66, 68, 70]

  constructor(container: HTMLElement) {
    // Initialize all channels (0–15) to program 0
    for (let ch = 0; ch < 16; ch++) {
      this.channelPrograms.set(ch, 0)
    }

    // Preload program 0 (acoustic_grand_piano) for channel 0 immediately
    Soundfont.instrument(this.audioCtx, WebMidiPiano.PROGRAM_TO_INSTRUMENT[0]).then((p) => {
      this.programPlayers.set(0, p)
    })
    Soundfont.instrument(this.audioCtx, WebMidiPiano.PROGRAM_TO_INSTRUMENT[126]).then((p) => {
      this.programPlayers.set(126, p)
    })

    //  — style the container as a relative-positioned “keyboard” frame —
    container.style.position = 'relative'
    container.style.width = '700px'
    container.style.height = '200px'
    container.style.userSelect = 'none'
    container.style.touchAction = 'none'

    // (A) Render all white keys side by side
    const whiteKeyCount = this.whiteNotes.length
    const whiteWidthPct = 100 / whiteKeyCount

    this.whiteNotes.forEach((noteNum, idx) => {
      const key = document.createElement('div')
      key.dataset.note = noteNum.toString()
      Object.assign(key.style, {
        position: 'absolute',
        left: `${idx * whiteWidthPct}%`,
        width: `${whiteWidthPct}%`,
        height: '100%',
        backgroundColor: 'white',
        border: '1px solid black',
        boxSizing: 'border-box',
        zIndex: '0',
      })
      this.attachPointerHandlers(key, noteNum)
      container.appendChild(key)
      this.keyElements.set(noteNum, key)
    })

    // (B) Render black keys on top, positioned between the whites
    const blackWidthPct = whiteWidthPct * 0.6
    const halfBw = blackWidthPct / 2
    // Map each black note to the index of the white key *before* it:
    const blackPositions: Record<number, number> = {
      61: 0, // C# between white[0]=C (60) and white[1]=D (62)
      63: 1, // D#
      66: 3, // F#
      68: 4, // G#
      70: 5, // A#
    }

    this.blackNotes.forEach((noteNum) => {
      const whiteIdx = blackPositions[noteNum]
      const leftPct = (whiteIdx + 1) * whiteWidthPct - halfBw
      const key = document.createElement('div')
      key.dataset.note = noteNum.toString()
      Object.assign(key.style, {
        position: 'absolute',
        left: `${leftPct}%`,
        width: `${blackWidthPct}%`,
        height: '60%',
        backgroundColor: 'black',
        border: '1px solid #333',
        borderRadius: '0 0 4px 4px',
        zIndex: '1',
      })
      this.attachPointerHandlers(key, noteNum)
      container.appendChild(key)
      this.keyElements.set(noteNum, key)
    })
  }

  // — implements TypedEventEmitter —
  on<E extends keyof NoteEventMap>(event: E, listener: NoteEventMap[E]) {
    this.emitter.on(event, listener)
    return this
  }
  off<E extends keyof NoteEventMap>(event: E, listener: NoteEventMap[E]) {
    this.emitter.off(event, listener)
    return this
  }

  /**
   * Convert a MIDI note number (0–127) to a note name string for Soundfont.js,
   * e.g. 60 → "C4", 61 → "C#4", 69 → "A4", 72 → "C5".
   */
  private midiToNoteName(midi: number): string {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    const octave = Math.floor(midi / 12) - 1
    const name = noteNames[midi % 12]
    return `${name}${octave}`
  }

  /**
   * `send(...)` mimics easymidi’s Output.send(...) signature.
   * We handle:
   *   • "program"   → program change (msg: { program: number; channel?: number })
   *   • "noteon"    → note-on (msg: { note: number; velocity: number; channel?: number })
   *   • "noteoff"   → note-off (msg: { note: number; velocity: number; channel?: number })
   * Other events are ignored.
   */
  send(event: string, msg: Note | Program) {
    console.log(`MIDI event "${event}", data: ${JSON.stringify(msg, null, 2)}`)

    if (event === 'program') {
      // Update the program for that channel
      const { channel, number } = msg as Program
      this.channelPrograms.set(channel, number)
      return
    }

    const {
      note,
      velocity,
      channel = 0,
    } = msg as {
      note: number
      velocity: number
      channel?: number
    }

    if (event === 'noteon' && velocity > 0) {
      this.playNote(note, velocity, channel)
    } else if (event === 'noteoff' || (event === 'noteon' && velocity === 0)) {
      this.stopNote(note)
    }
  }

  /**
   * Use Soundfont.js to play a note with the current channel’s program.
   * Convert MIDI number → note name (e.g. "C4").
   * If the Player isn’t loaded yet, load it, then play once ready.
   */
  private playNote(noteNum: number, velocity: number, channel: number) {
    const program = this.channelPrograms.get(channel) ?? 0
    const existingPlayer = this.programPlayers.get(program)
    const gainValue = velocity / 127
    const noteName = this.midiToNoteName(noteNum)

    if (existingPlayer) {
      const node = existingPlayer.play(noteName, this.audioCtx.currentTime, {
        gain: gainValue,
      })
      this.activeNodes.set(noteNum, { node })
      return
    }

    const instrName = WebMidiPiano.PROGRAM_TO_INSTRUMENT[program] ?? WebMidiPiano.PROGRAM_TO_INSTRUMENT[0]

    Soundfont.instrument(this.audioCtx, instrName).then((player) => {
      this.programPlayers.set(program, player)
      const node = player.play(noteName, this.audioCtx.currentTime, {
        gain: gainValue,
      })
      this.activeNodes.set(noteNum, { node })
    })
  }

  /**
   * Stop the note’s active Soundfont.js node (if any).
   */
  private stopNote(noteNum: number) {
    const entry = this.activeNodes.get(noteNum)
    if (!entry) {
      return
    }
    entry.node.stop()
    this.activeNodes.delete(noteNum)
  }

  /**
   * Visually highlight or unhighlight a key when the user clicks.
   * We do NOT tint keys when handling external noteon/noteoff via send().
   */
  private highlightKey(noteNum: number, on: boolean) {
    const el = this.keyElements.get(noteNum)
    if (!el) {
      return
    }
    if (on) {
      el.style.backgroundColor = this.whiteNotes.includes(noteNum) ? '#cef' : '#888'
    } else {
      el.style.backgroundColor = this.whiteNotes.includes(noteNum) ? 'white' : 'black'
    }
  }

  /**
   * When the user clicks a key, emit a noteon/noteoff and play via playNote().
   * Also visually tint the key.
   */
  private attachPointerHandlers(keyEl: HTMLElement, noteNum: number) {
    let isDown = false

    keyEl.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      if (isDown) {
        return
      }
      isDown = true
      const noteMsg: Note = { channel: 0, note: noteNum, velocity: 127 }
      this.emitter.emit('noteon', noteMsg)
      // this.playNote(noteNum, 127, 0)
      this.highlightKey(noteNum, true)
    })

    keyEl.addEventListener('pointerup', (e) => {
      e.preventDefault()
      if (!isDown) {
        return
      }
      isDown = false
      const noteMsg: Note = { channel: 0, note: noteNum, velocity: 0 }
      this.emitter.emit('noteoff', noteMsg)
      this.stopNote(noteNum)
      this.highlightKey(noteNum, false)
    })

    keyEl.addEventListener('pointerleave', () => {
      if (!isDown) {
        return
      }
      isDown = false
      const noteMsg: Note = { channel: 0, note: noteNum, velocity: 0 }
      this.emitter.emit('noteoff', noteMsg)
      this.stopNote(noteNum)
      this.highlightKey(noteNum, false)
    })
  }
}
