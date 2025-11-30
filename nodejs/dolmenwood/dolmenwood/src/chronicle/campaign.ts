import { DEFAULT_DATE_TIME } from '../date-time/calendar.js'
import { addTurns } from '../date-time/math.js'
import { type GameDateTime } from '../date-time/model.js'
import { randomUUID } from 'node:crypto'

export interface CampaignJson {
  /**
   * Campaign ID
   */
  id: string

  /**
   * Current date & time in the campaign.
   */
  currentDateTime: GameDateTime
}

/**
 * A Campaign is an out-of-fiction structure representing an ongoing series of sessions attended by a well-defined group
 * of players. Although the exact players may vary over time (or even session-to-session as is the case with West
 * Marches-style games), a campaign has a stable identity defined by characteristics such as house rules, policies for
 * how players join and leave the game, scheduling procedures, and so on.
 *
 * - A single {@link World} may host multiple campaigns over time (or even at once)
 * - A single player may participate in multiple campaigns
 * - Depending on rules for multi-play and PC survival rates, a player may have more than character in a campaign over
 *   time (or even at the same time)
 * - A campaign generally includes more than one {@link Adventure over time}
 */
export class Campaign {
  /**
   * Current date & time in the campaign.
   */
  public currentDateTime: GameDateTime

  public constructor(public readonly id: string = randomUUID()) {
    this.currentDateTime = DEFAULT_DATE_TIME
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
