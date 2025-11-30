import type { GameDateTime } from '../date-time/model.js'

export const ActivityTypes = [
  //
  'delve',
  'downtime',
  'journey',
  'survey',
] as const
export type ActivityType = (typeof ActivityTypes)[number]

/**
 *
 */
export interface Activity {
  /**
   * The type of activity
   */
  activityType: ActivityType

  /**
   * In-game timestamp at which the activity ended (if complete). If the activity is not complete, this is the current
   * time of the activity.
   */
  endTime: GameDateTime

  /**
   * In-game timestamp at which the activity began.
   */
  startTime: GameDateTime

  /**
   * The title of the activity.
   */
  title: string
}
