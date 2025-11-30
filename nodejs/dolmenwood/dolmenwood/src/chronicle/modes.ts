export interface GameMode {
  /**
   * Name of this mode
   */
  name: string
}

export const GameModes: GameMode[] = [
  {
    name: 'Camping',
  },
  {
    name: 'Combat',
  },
  {
    name: 'Dungeon',
  },
  {
    name: 'Encounter',
  },
  {
    name: 'Settlement',
  },
  { name: 'Travel' },
] as const satisfies GameMode[]
