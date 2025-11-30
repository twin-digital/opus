import { DEFAULT_DATE_TIME } from '../date-time/calendar.js'
import { type GameDateTime } from '../date-time/model.js'
import { randomUUID } from 'node:crypto'

export interface WorldJson {
  id: string
}

/**
 * Represents a single persistent game world or setting. The world is comprised of a timeline and history, geography,
 * cultures, magical systems, etc. Multiple {@link Campaign}s may be played in the same World.
 *
 * This is just a placeholder currently.
 */
export class World {
  /**
   * Current date & time in the campaign.
   */
  public currentDateTime: GameDateTime

  public constructor(public readonly id: string = randomUUID()) {
    this.currentDateTime = DEFAULT_DATE_TIME
  }

  public fromJSON(_state: WorldJson): void {
    /* noop */
  }

  public toJSON(): WorldJson {
    return {
      id: this.id,
    }
  }
}
