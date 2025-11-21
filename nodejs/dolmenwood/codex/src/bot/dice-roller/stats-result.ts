export interface StatsResult {
  /**
   * Unique identifier for this result.
   */
  id: string

  /**
   * ISO-8601 timestamp when the stats were rolled.
   */
  rolledAt: string

  /**
   * Discord ID of the user who rolled the stats.
   */
  rolledBy: string

  /**
   * Individual die results for each stat.
   */
  rolls: {
    strength: number[]
    intelligence: number[]
    wisdom: number[]
    dexterity: number[]
    constitution: number[]
    charisma: number[]
  }

  /**
   * Total score for each stat.
   */
  stats: {
    strength: number
    intelligence: number
    wisdom: number
    dexterity: number
    constitution: number
    charisma: number
  }
}
