import type { Channel } from 'easymidi'
import type { CallAndResponseChallenge, ChallengeResult } from '../call-and-response-challenge.js'
import { getNoteTicks, type SequencedEvent } from '../../../midi/sequencing.js'
import type { Drawable } from '../../../ui/drawable.js'
import { createRectangle } from '../../../ui/components/rectangle.js'
import { group } from '../../../ui/components/group.js'
import type { RgbColor } from '../../../ui/color.js'
import { translate } from '../../../ui/transform/translate.js'

const naturalNotes = [
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
  {
    name: 'C',
    value: 72,
  },
]

const sharpsAndFlats = [
  {
    name: 'C#',
    value: 61,
  },
  {
    name: 'D#',
    value: 63,
  },
  {
    name: 'F#',
    value: 66,
  },
  {
    name: 'G#',
    value: 68,
  },
  {
    name: 'A#',
    value: 70,
  },
]

const allNotes = [...naturalNotes, ...sharpsAndFlats]

const getRandomInt = (max: number) => {
  return Math.floor(Math.random() * max)
}

const makeArrowButton = ({
  color,
  direction,
  onPress,
  onRelease,
  rows = 3,
}: {
  color: RgbColor
  direction: 'down' | 'up'
  onPress?: () => void
  onRelease?: () => void
  rows?: number
}) => {
  // the row containing the 'point' of the arrow
  const pointRow = direction === 'up' ? rows - 1 : 0
  // the y direction in which the arrow gets wider
  const growDirection = direction === 'up' ? -1 : 1

  return group(
    ...Array.from({ length: rows }, (_, i) => {
      return translate(
        rows - 1 - i,
        pointRow + growDirection * i,
        createRectangle({
          color,
          height: 1,
          onPress,
          onRelease,
          width: 1 + 2 * i,
        }),
      )
    }),
  )
}

export class HigherOrLower implements CallAndResponseChallenge {
  public readonly challengeReplayInterval = 6000
  private note1: number
  private note2: number
  private result: ChallengeResult = 'pending'
  private downPressed = false
  private upPressed = false

  public static createRandom(): CallAndResponseChallenge {
    let first = 0
    let second = 0

    while (first === second) {
      first = getRandomInt(allNotes.length)
      second = getRandomInt(allNotes.length)
    }

    return new HigherOrLower(allNotes[first].value, allNotes[second].value)
  }

  public constructor(note1: number, note2: number) {
    this.note1 = note1
    this.note2 = note2
  }

  public getChallengeUi(): Drawable {
    return group(
      translate(
        0,
        4,
        makeArrowButton({
          color: this.upPressed ? [96, 96, 0] : [127, 127, 0],
          direction: 'up',
          onPress: () => {
            this.upPressed = true
          },
          onRelease: () => {
            this.upPressed = false
            this.result = this.note2 > this.note1 ? 'correct' : 'incorrect'
          },
        }),
      ),
      translate(
        0,
        1,
        makeArrowButton({
          color: this.downPressed ? [0, 0, 96] : [0, 0, 127],
          direction: 'down',
          onPress: () => {
            this.downPressed = true
          },
          onRelease: () => {
            this.downPressed = false
            this.result = this.note2 < this.note1 ? 'correct' : 'incorrect'
          },
        }),
      ),
    )
  }

  public getResult(): ChallengeResult {
    return this.result
  }

  public handleResponseNote(_note: number, _duration: number): void {
    // noop
  }

  public getChallengeSequence(channel: Channel): SequencedEvent[] {
    return [
      {
        deltaTimeMs: 500,
        deltaType: 'milliseconds',
        event: 'noteon',
        data: {
          channel,
          note: this.note1,
          velocity: 127,
        },
      },
      {
        deltaTime: getNoteTicks('half'),
        event: 'noteoff',
        data: {
          channel,
          note: this.note1,
          velocity: 0,
        },
      },
      {
        deltaTime: getNoteTicks('eighth'),
        event: 'noteon',
        data: {
          channel,
          note: this.note2,
          velocity: 127,
        },
      },
      {
        deltaTime: getNoteTicks('half'),
        event: 'noteoff',
        data: {
          channel,
          note: this.note2,
          velocity: 0,
        },
      },
    ]
  }

  public reset() {
    this.result = 'pending'
  }
}
