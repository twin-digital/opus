export interface OptionalRule {
  /**
   * Unique key used to lookup information about this optional rule.
   */
  key: string

  /**
   * Name of the optional rule.
   */
  name: string

  /**
   * Source of the optional rule.
   */
  source: {
    /**
     * Name of the source book containing the rule.
     */
    book: string

    /**
     * Page number containing the rule.
     */
    page: number
  }
}

export interface HouseRule {
  /**
   * Unique ID for this rule.
   */
  id: string

  /**
   * Name of the rule.
   */
  name: string

  /**
   * Full text of the rule.
   */
  rule: string

  /**
   * Source of the optional rule, such as a web URL, magazine reference, etc. May be undefined for homebrew rules
   * which do not have an external source.
   */
  source?: string

  /**
   * A short summary of the rule.
   */
  summary: string
}

const OptionalRuleData = [
  {
    key: 'sub-par-characters',
    name: 'Sub-Par Characters',
    source: {
      book: 'DPB',
      page: 18,
    },
  },
  {
    key: 'rerollings-1s-and-2s',
    name: 'Re-Rollings 1s and 2s',
    source: {
      book: 'DPB',
      page: 19,
    },
  },
  {
    key: 'buying-equipment',
    name: 'Buying Equipment',
    source: {
      book: 'DPB',
      page: 19,
    },
  },
  {
    key: 'training',
    name: 'Training',
    source: {
      book: 'DPB',
      page: 25,
    },
  },
  {
    key: 'customizing-bard-skills',
    name: 'Customizing Bard Skills',
    source: {
      book: 'DPB',
      page: 58,
    },
  },
  {
    key: 'customizing-hunter-skills',
    name: 'Customizing Hunter Skills',
    source: {
      book: 'DPB',
      page: 69,
    },
  },
  {
    key: 'customizing-thief-skills',
    name: 'Customizing Thief Skills',
    source: {
      book: 'DPB',
      page: 75,
    },
  },
  {
    key: 'simple-spell-books',
    name: 'Simple Spell Books',
    source: {
      book: 'DPB',
      page: 78,
    },
  },
  {
    key: 'quests-in-fairy',
    name: 'Quests in Fairy',
    source: {
      book: 'DPB',
      page: 93,
    },
  },
  {
    key: 'using-disallowed-weapons-and-armour',
    name: 'Using Disallowed Weapons and Armour',
    source: {
      book: 'DPB',
      page: 119,
    },
  },
  {
    key: 'inebriation',
    name: 'Inebriation',
    source: {
      book: 'DPB',
      page: 127,
    },
  },
  {
    key: 'smoking',
    name: 'Smoking',
    source: {
      book: 'DPB',
      page: 129,
    },
  },
  {
    key: 'basic-weight-encumbrance',
    name: 'Basic Weight Encumbrance',
    source: {
      book: 'DPB',
      page: 148,
    },
  },
  {
    key: 'falling-asleep-on-watch',
    name: 'Falling Asleep on Watch',
    source: {
      book: 'DPB',
      page: 159,
    },
  },
  {
    key: 'lifestyle-expenses',
    name: 'Lifestyle Expenses',
    source: {
      book: 'DPB',
      page: 161,
    },
  },
  {
    key: 'valuation',
    name: 'Treasure Valuation',
    source: {
      book: 'DPB',
      page: 161,
    },
  },
  {
    key: 'established-safe-paths',
    name: 'Established Safe Paths',
    source: {
      book: 'DPB',
      page: 162,
    },
  },
  {
    key: 'exiting-the-dungeon',
    name: 'Exiting the Dungeon',
    source: {
      book: 'DPB',
      page: 163,
    },
  },
  {
    key: 'moon-signs',
    name: 'Moon Signs',
    source: {
      book: 'DPB',
      page: 174,
    },
  },
] as const satisfies OptionalRule[]
export type OptionalRuleKey = (typeof OptionalRuleData)[number]['key']

export const OptionalRules = OptionalRuleData.reduce<Record<OptionalRuleKey, OptionalRule>>(
  (acc, rule) => {
    acc[rule.key] = rule
    return acc
  },
  {} as Record<OptionalRuleKey, OptionalRule>,
)

export interface CustomRules {
  encumbranceSystem: 'none' | 'slot' | 'weight'
  houseRules: HouseRule[]
  optionalRules: Record<OptionalRuleKey, boolean>
}

export const CustomRules = {
  encumbranceSystem: 'slot',
  houseRules: [],
  optionalRules: {
    'sub-par-characters': true,
    'rerollings-1s-and-2s': true,
    'buying-equipment': false,
    training: false,
    'customizing-bard-skills': false,
    'customizing-hunter-skills': false,
    'customizing-thief-skills': false,
    'simple-spell-books': true,
    'quests-in-fairy': true,
    'using-disallowed-weapons-and-armour': true,
    inebriation: false,
    smoking: true,
    'basic-weight-encumbrance': false,
    'falling-asleep-on-watch': false,
    'lifestyle-expenses': true,
    valuation: false,
    'established-safe-paths': true,
    'exiting-the-dungeon': true,
    'moon-signs': false,
  },
} as const satisfies CustomRules

/**
 * Creates an ASCII table showing optional rule selections.
 * @param selections Record of optional rule keys to their active status
 * @returns Formatted ASCII table string
 */
export function formatOptionalRulesTable(selections: Record<OptionalRuleKey, boolean>): string {
  // Sort rules by page number
  const sortedRules = [...OptionalRuleData].sort((a, b) => a.source.page - b.source.page)

  // Calculate column widths
  const nameWidth = Math.max(...sortedRules.map((r) => r.name.length), 'Rule Name'.length)
  const pageWidth = 'Page'.length
  const activeWidth = 'Active'.length

  // Create header
  const topBorder = `┌${'─'.repeat(nameWidth + 2)}┬${'─'.repeat(pageWidth + 2)}┬${'─'.repeat(activeWidth + 2)}┐`
  const headerRow = `│ ${'Rule Name'.padEnd(nameWidth)} │ ${'Page'.padEnd(pageWidth)} │ ${'Active'.padEnd(activeWidth)} │`
  const separator = `├${'─'.repeat(nameWidth + 2)}┼${'─'.repeat(pageWidth + 2)}┼${'─'.repeat(activeWidth + 2)}┤`
  const bottomBorder = `└${'─'.repeat(nameWidth + 2)}┴${'─'.repeat(pageWidth + 2)}┴${'─'.repeat(activeWidth + 2)}┘`

  // Create rows
  const rows = sortedRules.map((rule) => {
    const isActive = selections[rule.key]
    const activeIcon = isActive ? '✅' : '❌'
    const name = rule.name.padEnd(nameWidth)
    const page = rule.source.page.toString().padEnd(pageWidth)
    const active = activeIcon.padEnd(activeWidth)
    return `│ ${name} │ ${page} │ ${active} │`
  })

  // Assemble table
  return [topBorder, headerRow, separator, ...rows, bottomBorder].join('\n')
}
