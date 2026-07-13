import type { Channel } from 'easymidi'
import { animate } from 'popmotion'
import type { MidiScheduler } from '../../../midi/sequencing.js'
import type { CallAndResponseContext } from '../call-and-response-context.js'
import type { State } from '../../state-machine.js'
import { consumeVerbalFeedback } from './verbal-feedback.js'
import { createRectangle } from '../../../ui/components/rectangle.js'
import { group } from '../../../ui/components/group.js'
import { translate } from '../../../ui/transform/translate.js'
import type { Entity } from '../../../engine/entity.js'
import type { Drawable } from '../../../ui/drawable.js'

export class RedXEntity implements Entity {
  private color = 0
  private alive = true
  private animate: ((elapsedMs: number) => void) | undefined

  public constructor() {
    animate({
      driver: (callback) => {
        this.animate = callback
        return {
          start: () => {
            this.animate = callback
          },
          stop: () => {
            this.animate = undefined
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
        this.color = latest
      },
      onComplete: () => {
        this.alive = false
      },
    })
  }

  getDrawable(): Drawable {
    console.log('drawing x')
    return group(
      ...Array.from({ length: 7 }, (_, y) => y).flatMap((y) => [
        translate(
          y,
          y,
          createRectangle({
            color: [this.color, 0, 0],
            height: 1,
            width: 1,
          }),
        ),
        translate(
          6 - y,
          y,
          createRectangle({
            color: [this.color, 0, 0],
            height: 1,
            width: 1,
          }),
        ),
      ]),
    )
  }

  isAlive(): boolean {
    return this.alive
  }

  public update(elapsedSeconds: number): void {
    this.animate?.(elapsedSeconds * 1000)
  }
}

export const makePlayNegativeFeedbackState =
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
  (context: CallAndResponseContext) => {
    let done = false
    let speech = { isDone: () => true }

    return {
      enter: (entityManager) => {
        speech = consumeVerbalFeedback(context)
        entityManager.add(new RedXEntity())
        midi.addSequence(
          [
            {
              data: {
                channel,
                number: 118,
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
              deltaTimeMs: 750,
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
      // wait for the spoken feedback too, so the replayed challenge never talks over it
      isDone: () => done && speech.isDone(),
      stateName: 'play-negative-feedback' as const,
    } satisfies State
  }
