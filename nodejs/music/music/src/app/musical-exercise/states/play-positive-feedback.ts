import type { Channel } from 'easymidi'
import { animate } from 'popmotion'
import type { MidiScheduler } from '../../../midi/sequencing.js'
import type { CallAndResponseContext } from '../call-and-response-context.js'
import type { Drawable } from '../../../ui/drawable.js'
import type { State } from '../../state-machine.js'
import { createRectangle } from '../../../ui/components/rectangle.js'
import { group } from '../../../ui/components/group.js'
import { translate } from '../../../ui/transform/translate.js'

const _checkmark = (): Drawable => {
  return {
    draw: () =>
      [
        [1, 5],
        [2, 4],
        [3, 3],
        [4, 2],
        [5, 3],
        [6, 4],
      ].map(([x, y]) => ({
        x,
        y,
        value: [0, 127, 0],
      })),
  }
}

const _getRandomInt = (max: number) => {
  return Math.floor(Math.random() * max)
}

const gridFlash = () => {
  let color = 0
  let update: ((elapsedMs: number) => void) | undefined

  animate({
    driver: (callback) => {
      update = callback
      return {
        start: () => {
          update = callback
        },
        stop: () => {
          update = undefined
        },
      }
    },
    duration: 500,
    from: 0,
    repeat: 1,
    repeatType: 'reverse',
    to: 127,
    type: 'spring',
    onUpdate: (latest) => {
      color = latest
    },
  })

  return () => ({
    draw: () => {
      return group(
        ...Array.from({ length: 8 }, (_, i) =>
          translate(
            0,
            i,
            createRectangle({
              color: [0, color * ((i + 1) / 9), 0],
              height: 1,
              width: 8,
            }),
          ),
        ),
      )
    },
    tick: (elapsedSeconds: number) => {
      update?.(elapsedSeconds * 1000)
    },
  })
}

export const makePlayPositiveFeedbackState =
  ({
    channel,
    midi,
  }: {
    /**
     * MIDI channel on which the feedback will be played.
     */
    channel: Channel

    /**
     * MIDI scheduler which should be used to play feedback.
     */
    midi: MidiScheduler
  }) =>
  (_: CallAndResponseContext) => {
    let done = false
    const flash = gridFlash()

    return {
      enter: () => {
        midi.addSequence(
          [
            {
              data: {
                channel,
                number: 15 * 8 + 6,
              },
              deltaTimeMs: 0,
              deltaType: 'milliseconds',
              event: 'program',
            },
            {
              data: {
                channel,
                note: 60,
                velocity: 96,
              },
              deltaTimeMs: 200,
              deltaType: 'milliseconds',
              event: 'noteon',
            },
            {
              data: {
                channel,
                note: 60,
                velocity: 0,
              },
              deltaTimeMs: 1250,
              deltaType: 'milliseconds',
              event: 'noteon',
            },
          ],
          () => {
            done = true
          },
        )
      },
      getResult: () => 'done' as const,
      getDrawable: () => flash().draw(),
      isDone: () => done,
      stateName: 'play-positive-feedback' as const,
      update: (elapsedSeconds: number) => {
        flash().tick(elapsedSeconds)
      },
    } satisfies State
  }
