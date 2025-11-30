import { DEFAULT_DATE_TIME } from '../date-time/calendar.js'
import { type GameDateTime } from '../date-time/model.js'
import { randomUUID } from 'node:crypto'

export interface SessionJson {
  id: string
}

/**
 * A Session is a single real-world meeting of players.
 */
export class Session {
  /**
   * Current date & time in the campaign.
   */
  public currentDateTime: GameDateTime

  public constructor(public readonly id: string = randomUUID()) {
    this.currentDateTime = DEFAULT_DATE_TIME
  }

  public fromJSON(_state: SessionJson): void {
    /* noop */
  }

  public toJSON(): SessionJson {
    return {
      id: this.id,
    }
  }
}
