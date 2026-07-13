import type { Channel } from 'easymidi'
import { logger } from '../../../logger.js'
import type { CallAndResponseChallenge, ChallengeResponse, ChallengeResult } from '../call-and-response-challenge.js'
import { getNoteTicks, type SequencedEvent } from '../../../midi/sequencing.js'

const log = logger.child({}, { msgPrefix: '[EAR] ' })

// Challenge pool: the natural notes of a single octave with middle C as its lowest point —
// starting simple; widen the range as the student progresses.
const notes = [
  {
    name: 'C',
    value: 60,
  },
  {
    name: 'D',
    value: 62,
  },
  {
    name: 'E',
    value: 64,
  },
  {
    name: 'F',
    value: 65,
  },
  {
    name: 'G',
    value: 67,
  },
  {
    name: 'A',
    value: 69,
  },
  {
    name: 'B',
    value: 71,
  },
]

/**
 * Spoken names for each pitch class, indexed by `note % 12`. Responses can be any key on the
 * keyboard (including accidentals), so all twelve are named.
 */
const SpokenNoteNames = [
  'C',
  'C sharp',
  'D',
  'D sharp',
  'E',
  'F',
  'F sharp',
  'G',
  'G sharp',
  'A',
  'A sharp',
  'B',
] as const

const getRandomInt = (max: number) => {
  return Math.floor(Math.random() * max)
}

export class SingleNoteEarTraining implements CallAndResponseChallenge {
  public readonly challengeReplayInterval = 4000
  private note: number
  private result: ChallengeResult = 'pending'

  public static createRandom(): CallAndResponseChallenge {
    const index = getRandomInt(notes.length)
    return new SingleNoteEarTraining(notes[index].value)
  }

  public constructor(note: number) {
    this.note = note
  }

  public getResult(): ChallengeResult {
    return this.result
  }

  public getVerbalFeedback(
    result: Exclude<ChallengeResult, 'pending'>,
    response?: ChallengeResponse,
  ): string | undefined {
    if (result !== 'incorrect' || response === undefined) {
      return undefined
    }

    // name the note the student played, then point them toward the target
    const playedName = SpokenNoteNames[response.note % 12]
    const direction = this.note > response.note ? 'higher' : 'lower'
    return `${playedName}. My note is ${direction}!`
  }

  public handleResponseNote(note: number, _duration: number): void {
    log.info(`Received response note: ${note}`)

    if (note === this.note) {
      this.result = 'correct'
    } else {
      this.result = 'incorrect'
    }
  }

  public getChallengeSequence(channel: Channel): SequencedEvent[] {
    return [
      {
        deltaTime: 500,
        event: 'noteon',
        data: {
          channel,
          note: this.note,
          velocity: 96,
        },
      },
      {
        deltaTime: getNoteTicks('quarter'),
        event: 'noteoff',
        data: {
          channel,
          note: this.note,
          velocity: 0,
        },
      },
    ]
  }

  public reset() {
    this.result = 'pending'
  }
}
