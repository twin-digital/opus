import { describe, expect, it, vi } from 'vitest'

import type { MidiScheduler } from '../../../midi/sequencing.js'
import { SingleNoteEarTraining } from '../challenges/single-note-ear-training.js'
import { makeInitialContext } from '../call-and-response-context.js'
import { EarTrainingGames } from '../games.js'
import { consumeVerbalFeedback } from './verbal-feedback.js'
import { makePlayNegativeFeedbackState } from './play-negative-feedback.js'
import { makeWaitForResponseState } from './wait-for-response.js'

vi.mock('../../speak.js', () => ({ speak: vi.fn(() => Promise.resolve()) }))
// the native MIDI stack can't load in unit tests; nothing here ever constructs a real device
vi.mock('easymidi', () => ({ Input: vi.fn(), Output: vi.fn() }))
vi.mock('@julusian/midi', () => ({ Input: vi.fn(), Output: vi.fn() }))
import { speak } from '../../speak.js'

const makeContext = () => makeInitialContext(EarTrainingGames[0])

describe('consumeVerbalFeedback', () => {
  it('speaks and clears the pending feedback, gating isDone on speech completion', async () => {
    let finishSpeech = () => {
      /* replaced below */
    }
    vi.mocked(speak).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishSpeech = resolve
        }),
    )
    const context = makeContext()
    context.verbalFeedback = 'C. My note is higher!'

    const speech = consumeVerbalFeedback(context)
    expect(speak).toHaveBeenCalledExactlyOnceWith('C. My note is higher!')
    expect(context.verbalFeedback).toBeUndefined()
    expect(speech.isDone()).toBe(false)

    finishSpeech()
    await Promise.resolve()
    expect(speech.isDone()).toBe(true)
  })

  it('is immediately done and silent when no feedback is pending', () => {
    vi.mocked(speak).mockClear()
    const speech = consumeVerbalFeedback(makeContext())
    expect(speak).not.toHaveBeenCalled()
    expect(speech.isDone()).toBe(true)
  })
})

describe('play-negative-feedback verbal gating', () => {
  it('is not done until both the feedback audio and the speech finish', async () => {
    let finishSpeech = () => {
      /* replaced below */
    }
    vi.mocked(speak).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishSpeech = resolve
        }),
    )
    let finishAudio = () => {
      /* replaced below */
    }
    const midi = {
      addSequence: vi.fn((_events: unknown, onComplete?: () => void) => {
        finishAudio = onComplete ?? finishAudio
      }),
    } as unknown as MidiScheduler

    const context = makeContext()
    context.verbalFeedback = 'E. My note is lower!'
    const state = makePlayNegativeFeedbackState({ channel: 6, midi })(context)
    state.enter({ add: vi.fn() } as never)

    expect(state.isDone()).toBe(false)
    finishAudio()
    expect(state.isDone()).toBe(false) // audio done, speech still going

    finishSpeech()
    await Promise.resolve()
    expect(state.isDone()).toBe(true)
  })
})

describe('wait-for-response feedback snapshot', () => {
  const makeDevice = () => {
    const handlers = new Map<string, (note: { channel: number; note: number; velocity: number }) => void>()
    return {
      handlers,
      device: {
        on: vi.fn((event: string, handler: never) => {
          handlers.set(event, handler)
        }),
        off: vi.fn(),
        send: vi.fn(),
      },
    }
  }

  const playNote = (handlers: ReturnType<typeof makeDevice>['handlers'], note: number) => {
    handlers.get('noteon')?.({ channel: 0, note, velocity: 96 })
    handlers.get('noteoff')?.({ channel: 0, note, velocity: 0 })
  }

  it('snapshots challenge feedback with the machine-observed response before reset()', () => {
    const { device, handlers } = makeDevice()
    const context = makeContext()
    context.challenge = new SingleNoteEarTraining(60) // C

    const state = makeWaitForResponseState({ channel: 0, device: device as never, echoChannel: 3 })(context)
    state.enter()
    playNote(handlers, 64) // played E; target C is lower

    expect(state.isDone()).toBe(true)
    expect(state.getResult()).toBe('incorrect')

    state.exit()
    expect(context.verbalFeedback).toBe('E. My note is lower!')
    // reset() ran after the snapshot: the challenge is pending again for the replay
    expect(context.challenge.getResult()).toBe('pending')
  })

  it('leaves no feedback when the round was answered correctly and the challenge stays silent', () => {
    const { device, handlers } = makeDevice()
    const context = makeContext()
    context.challenge = new SingleNoteEarTraining(60)

    const state = makeWaitForResponseState({ channel: 0, device: device as never, echoChannel: 3 })(context)
    state.enter()
    playNote(handlers, 60)

    state.exit()
    expect(context.verbalFeedback).toBeUndefined()
  })
})
