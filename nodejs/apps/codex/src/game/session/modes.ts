export const GameModes = ['Camping', 'Combat', 'Dungeon', 'Encounter', 'Settlement', 'Travel'] as const
export type GameMode = (typeof GameModes)[number]
