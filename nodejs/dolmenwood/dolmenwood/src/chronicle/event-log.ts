import { makeAutoObservable } from 'mobx'
import { fromTimestamp, toTimestamp } from '../date-time/math.js'
import type { GameDateTime } from '../date-time/model.js'

export interface EventLogEntry {
  /**
   * Description of the event.
   */
  readonly description: string

  /**
   * Date/time in the game world when the event occurred.
   */
  readonly gameTime: GameDateTime

  /**
   * Date/time in the real world when the event occurred.
   */
  readonly realTime: Date
}

export interface EventLogJson {
  description: string
  gameTime: number
  realTime: string
}

/**
 * A log of interesting events which have happened during a chronicle.
 */
export class EventLog {
  private _events: EventLogEntry[] = []

  public constructor() {
    makeAutoObservable(this)
  }

  public addEvent(description: string, gameTime: GameDateTime): void {
    this._events.push({
      description,
      gameTime,
      realTime: new Date(),
    })
  }

  public get events(): readonly EventLogEntry[] {
    return this._events
  }

  /**
   * Rewinds the event log to the specified (game) time by removing any events with a later time.
   */
  public rewindTo(gameTime: GameDateTime): void {
    const targetTimestamp = toTimestamp(gameTime)

    let i = this._events.length
    while (i--) {
      if (toTimestamp(this._events[i].gameTime) > targetTimestamp) {
        this._events.splice(i, 1)
      }
    }
  }

  /**
   * Loads the events from a serialized state.
   */
  public fromJSON(state: EventLogJson[]): void {
    this._events = state.map((event) => ({
      ...event,
      gameTime: fromTimestamp(event.gameTime),
      realTime: new Date(event.realTime),
    }))
  }

  /**
   * Serializes the events to a JSON object.
   */
  public toJSON(): EventLogJson[] {
    return this._events.map((event) => ({
      ...event,
      gameTime: toTimestamp(event.gameTime),
      realTime: event.realTime.toISOString(),
    }))
  }
}
