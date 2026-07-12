import { currentTimeMillis } from '../engine/timer.js'
import type { MidiDevice } from './midi-device.js'
import type { MidiEventMap } from './midi-events.js'

export type DeltaTime =
  | {
      deltaType?: 'ticks'

      /**
       * Delay (in tempo-specific ticks) since the last event before this event should trigger.
       */
      deltaTime: number
    }
  | {
      deltaType: 'milliseconds'

      /**
       * Delay (in milliseconds) since the last event before this event should trigger.
       */
      deltaTimeMs: number
    }

export type SequencedEvent<T extends keyof MidiEventMap = keyof MidiEventMap> = DeltaTime & {
  data: Parameters<MidiEventMap[T]>[0]
  event: T
}

export interface SequenceState {
  /**
   * List of events in this sequence.
   */
  events: SequencedEvent[]

  /**
   * Absolute time, in millis, of when the next event from this sequence should play.
   */
  nextEventAt: number

  /**
   * Index of the next to play
   */
  nextEventIndex: number

  /**
   * Callback to invoke when the last event of this sequence is fired.
   */
  onComplete?: () => void
}

export const getNoteTicks = (
  note: 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth' | 'thirty-second',
  quantity = 1,
  ppq = 480,
): number => {
  const multipliers = {
    whole: 4,
    half: 2,
    quarter: 1,
    eighth: 0.5,
    sixteenth: 0.25,
    'thirty-second': 0.125,
  }

  return multipliers[note] * ppq * quantity
}

export class MidiScheduler {
  /**
   * "Ticks-per-quarter" (called `division` in the MIDI spec). This is how many ticks make up a single quarter-note.
   */
  private ppq = 480

  /**
   * Tempo, in microseconds per quarter note. 500,000 is 120 BPM.
   */
  private tempo = 500_000

  /**
   * List of all sequences which are currently being played
   */
  private activeSequences: SequenceState[] = []

  /**
   * Handle for our loop schedule's timer.
   */
  private timeoutHandle: ReturnType<typeof setTimeout> | undefined

  public constructor(private device: MidiDevice) {}

  /**
   * Given a SequencedEvent with a delta time in either ticks or milliseconds, convert the delta time to milliseconds.
   */
  private deltaTimeInMs(event: SequencedEvent): number {
    const tickDurationMs = this.tempo / this.ppq / 1000
    return event.deltaType === 'milliseconds' ? event.deltaTimeMs : event.deltaTime * tickDurationMs
  }

  /**
   * Updates our schedule for the next event. Cancels any existing timer and sets one for the current 'next' event.
   */
  private rescheduleLoop() {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle)
    }

    if (this.activeSequences.length === 0) {
      // nothing to schedule
      return
    }

    // sort sequences by time of their next event
    this.activeSequences.sort((a, b) => a.nextEventAt - b.nextEventAt)

    const now = currentTimeMillis()
    const next = this.activeSequences[0]
    const wait = next.nextEventAt - now

    if (wait <= 0) {
      // next event is due/late, fire it immediately (fire will handle scheduling the next)
      this.fireNext()
    } else {
      this.timeoutHandle = setTimeout(this.fireNext.bind(this), wait)
    }
  }

  /**
   * Fires our next event, and schedules the one after that. Assumes the active sequences are sorted in order of their
   * next event
   */
  private fireNext() {
    const now = currentTimeMillis()

    // Fire every due/late event in one batch:
    while (this.activeSequences.length > 0 && this.activeSequences[0].nextEventAt <= now) {
      // remove first sequence for processing
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const sequence = this.activeSequences.shift()!

      // The event we’re firing is whatever sequence.nextIndex currently points to:
      const event = sequence.events[sequence.nextEventIndex]
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      this.device.send(event.event, event.data as any)

      sequence.nextEventIndex += 1
      if (sequence.nextEventIndex < sequence.events.length) {
        sequence.nextEventAt = now + this.deltaTimeInMs(sequence.events[sequence.nextEventIndex])
        this.activeSequences.push(sequence)
      } else {
        sequence.onComplete?.()
        // If no more events, we simply let the sequence drop out.
      }
    }

    // Now set the timeout for whatever’s next (if anything remains):
    this.rescheduleLoop()
  }

  /**
   * Add a sequence of events to the scheduler for playback. If an `onComplete` callback is provided, it will be invoked
   * when the sequence is complete.
   */
  public addSequence(events: SequencedEvent[], onComplete?: () => void) {
    // noop for empty events list
    if (events.length === 0) {
      return
    }

    this.activeSequences.push({
      events,
      nextEventAt: currentTimeMillis() + this.deltaTimeInMs(events[0]),
      nextEventIndex: 0,
      onComplete,
    })

    this.rescheduleLoop()
  }
}
