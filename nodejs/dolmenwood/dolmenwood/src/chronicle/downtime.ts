import { DEFAULT_DATE_TIME } from '../date-time/calendar.js'
import { type GameDateTime } from '../date-time/model.js'
import { randomUUID } from 'node:crypto'

export interface DowntimeJson {
  id: string
}

/**
 * A Downtime records a period of time where characters performed activities in a safe haven such as crafting,
 * carousing, training, etc. Occurs between expeditions or between major beats of an adventure.
 */
export class Downtime {
  /**
   * Current date & time in the campaign.
   */
  public currentDateTime: GameDateTime

  public constructor(public readonly id: string = randomUUID()) {
    this.currentDateTime = DEFAULT_DATE_TIME
  }

  public fromJSON(_state: DowntimeJson): void {
    /* noop */
  }

  public toJSON(): DowntimeJson {
    return {
      id: this.id,
    }
  }
}
