import { makeLookupTable, type LookupTable } from './lookup-table.js'

export interface AbilityScore {
  /**
   * Short name of the ability
   */
  abbreviation: string

  /**
   * Full name of the ability
   */
  name: string
}

export const AbilityScores: AbilityScore[] = [
  {
    abbreviation: 'str',
    name: 'strength',
  },
  {
    abbreviation: 'int',
    name: 'intelligence',
  },
  {
    abbreviation: 'wis',
    name: 'wisdom',
  },
  {
    abbreviation: 'dex',
    name: 'dexterity',
  },
  {
    abbreviation: 'con',
    name: 'constitution',
  },
  {
    abbreviation: 'cha',
    name: 'charisma',
  },
] as const satisfies AbilityScore[]

export const AbilityModifiers: LookupTable<number> = makeLookupTable([
  {
    maximumValue: 3,
    minimumValue: Number.MIN_SAFE_INTEGER,
    data: -3,
  },
  {
    maximumValue: 5,
    minimumValue: 4,
    data: -2,
  },
  {
    maximumValue: 8,
    minimumValue: 6,
    data: -1,
  },
  {
    maximumValue: 12,
    minimumValue: 9,
    data: 0,
  },
  {
    maximumValue: 15,
    minimumValue: 13,
    data: 1,
  },
  {
    maximumValue: 17,
    minimumValue: 16,
    data: 2,
  },
  {
    maximumValue: Number.MAX_SAFE_INTEGER,
    minimumValue: 18,
    data: 3,
  },
])
