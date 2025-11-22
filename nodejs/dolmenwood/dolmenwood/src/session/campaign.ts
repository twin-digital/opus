import { DEFAULT_CURRENT_YEAR } from '../date-time/calendar.js'
import { addTurns } from '../date-time/math.js'
import { type GameDateTime } from '../date-time/model.js'
import { randomUUID } from 'node:crypto'

const DefaultDateTime = {
  day: 1,
  hour: 15,
  month: 4,
  turn: 1,
  year: DEFAULT_CURRENT_YEAR,
} satisfies GameDateTime

export interface CampaignJson {
  id: string
  currentDateTime: GameDateTime
}

export class Campaign {
  /**
   * Current date & time in the campaign.
   */
  public currentDateTime: GameDateTime

  public constructor(public readonly id: string = randomUUID()) {
    this.id = id
    this.currentDateTime = DefaultDateTime
  }

  public advanceTurn(delta = 1): void {
    this.currentDateTime = addTurns(this.currentDateTime, delta)
  }

  public fromJSON(state: CampaignJson): void {
    this.currentDateTime = state.currentDateTime
  }

  public toJSON(): CampaignJson {
    return {
      id: this.id,
      currentDateTime: this.currentDateTime,
    }
  }
}
