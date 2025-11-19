export type Player = {
  /**
   * ID of the player.
   */
  id: string
} & Partial<{
  /**
   * ID of the player's active character, if any.
   */
  activeCharacterId: string

  /**
   * Discord display name, as it was last captured.
   */
  displayName?: string
}>

export type PlayerCharacter = {
  /**
   * ID of the character.
   */
  id: string

  /**
   * Player associated with this character.
   */
  playerId: string
} & Partial<{
  /**
   * Total score for each stat.
   */
  stats: CharacterStats

  /**
   * ID of the PlayerCharacterStatRoll associated with this character, if any.
   */
  statRollId: string
}>

export type PlayerCharacterWithStats = PlayerCharacter & {
  /**
   * Total score for each stat.
   */
  stats: CharacterStats

  /**
   * ID of the PlayerCharacterStatRoll associated with this character, if any.
   */
  statRollId: string
}

export interface CharacterStats {
  strength: number
  intelligence: number
  wisdom: number
  dexterity: number
  constitution: number
  charisma: number
}

export interface StatRoll {
  strength: number[]
  intelligence: number[]
  wisdom: number[]
  dexterity: number[]
  constitution: number[]
  charisma: number[]
}

export interface PlayerCharacterStatRoll {
  /**
   * Unique identifier for this result.
   */
  id: string

  /**
   * ISO-8601 timestamp when the stats were rolled.
   */
  rolledAt: string

  /**
   * Individual die results for each stat.
   */
  rolls: StatRoll
}

export interface PlayerService {
  /**
   * Retrieves the player with the specified Discord id, creating one if needed.
   */
  getPlayer(discordPlayerId: string): Promise<Player>

  /**
   * Retrieves the player with the given discord ID, and their active player character. Both the player, and character,
   * will be created if they do not already exist.
   * @param discordPlayerId
   */
  getPlayerAndCharacter(discordPlayerId: string): Promise<{ character: PlayerCharacter; player: Player }>
}

export interface PlayerCharacterService {
  /**
   * Rolls stats for the specified character. Will return previously rolled stats if they already exist. `isNew`
   * indicates if the stats were rolled fresh, or returned from an earlier result. The complete character, with new stats,
   * is returned.
   */
  rollStats(characterId: string): Promise<{
    results: PlayerCharacterStatRoll
    isNew: boolean
  }>
}
