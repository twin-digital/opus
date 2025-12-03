export const EncounterRules = {
  /**
   * Default X-in-6 chance that an unaware side is surprised by an encounter.
   */
  defaultSurpriseChance: 2,

  /**
   * Die notation used to determine the encounter distance in a dungeon if at least one side is not surprised.
   */
  dungeonEncounterDistance: '2d6*10',

  /**
   * Die notation used to determine the encounter distance in a dungeon if both sides are surprised.
   */
  dungeonEncounterDistanceSurprised: '1d4*10',

  /**
   * Die notation used to determine the encounter distance outdoors if at least one side is not surprised.
   */
  outdoorEncounterDistance: '2d6*30',

  /**
   * Die notation used to determine the encounter distance outdoors if both sides are surprised.
   */
  outdoorEncounterDistanceSurprised: '1d4*30',
} as const
