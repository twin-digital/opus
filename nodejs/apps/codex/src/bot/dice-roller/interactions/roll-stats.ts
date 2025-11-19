import { Chalk } from 'chalk'
import sum from 'lodash-es/sum.js'
import type { CommandHandlerFn } from '../../bot.js'
import type { RepositoryFactory } from '../../../core/db/repository-factory.js'
import { patchRecord } from '../../../core/db/utils.js'
import type { Player, PlayerCharacter, PlayerCharacterStatRoll, StatRoll } from '../../../game/model.js'
import { DefaultPlayerService } from '../../../game/player/player-service.js'
import { DefaultPlayerCharacterService } from '../../../game/player/player-character-service.js'

// Force ANSI color output even when Node isn't running in a TTY so
// the generated strings include escape sequences (Discord "```ansi```" blocks
// will then render the colors). Chalk auto-detects terminal support and may
// disable colors when not run in a TTY; creating a Chalk instance with
// level: 3 ensures full color output.
const chalk = new Chalk({ level: 3 })

const formatStats = (roll: StatRoll) => {
  const attributeNames = ['STR', 'INT', 'WIS', 'DEX', 'CON', 'CHA']
  const values = [
    sum(roll.strength),
    sum(roll.intelligence),
    sum(roll.wisdom),
    sum(roll.dexterity),
    sum(roll.constitution),
    sum(roll.charisma),
  ]

  const toDiceString = (values: number[]) => values.join(' + ')
  const dice = [
    toDiceString(roll.strength),
    toDiceString(roll.intelligence),
    toDiceString(roll.wisdom),
    toDiceString(roll.dexterity),
    toDiceString(roll.constitution),
    toDiceString(roll.charisma),
  ]

  // Column content widths (no padding)
  const statContentWidth = Math.max('Stat'.length, ...attributeNames.map((n) => n.length))
  const valueContentWidth = Math.max('Val'.length, ...values.map((v) => String(v).length))
  const diceContentWidth = Math.max('Dice'.length, ...dice.map((d) => d.length))

  // Total column widths include 1 space left + content + 1 space right
  // For dice column we add two additional spaces on either side (total 3 each side)
  const statColWidth = statContentWidth + 2
  const valueColWidth = valueContentWidth + 2
  const diceColWidth = diceContentWidth + 6

  // Cell renderers
  const centerCell = (text: string, contentWidth: number) => {
    const totalPad = contentWidth - text.length
    const left = Math.floor(totalPad / 2)
    const right = totalPad - left
    return ' ' + ' '.repeat(left) + text + ' '.repeat(right) + ' '
  }

  // Unicode box drawing characters for tighter table
  const top = '┌' + '─'.repeat(statColWidth) + '┬' + '─'.repeat(valueColWidth) + '┬' + '─'.repeat(diceColWidth) + '┐'
  const mid = '├' + '─'.repeat(statColWidth) + '┼' + '─'.repeat(valueColWidth) + '┼' + '─'.repeat(diceColWidth) + '┤'
  const bottom = '└' + '─'.repeat(statColWidth) + '┴' + '─'.repeat(valueColWidth) + '┴' + '─'.repeat(diceColWidth) + '┘'

  // Left-justify Dice header with 3 leading blanks inside the content area
  // padEnd to match the dice column total width (content + 6) minus the two wrapper spaces
  const diceHeaderInner = (' '.repeat(4) + 'Rolls').padEnd(diceContentWidth + 4)
  const header =
    '│' +
    centerCell('Stat', statContentWidth) +
    '│' +
    centerCell('Val', valueContentWidth) +
    '│' +
    ' ' +
    diceHeaderInner +
    ' ' +
    '│'

  const rows = attributeNames.map((name, i) => {
    const v = values[i]
    const colorFor = (n: number) =>
      n < 9 ? chalk.red
      : n > 12 ? chalk.green
      : (s: string) => s

    const statPadded = name.padEnd(statContentWidth)
    const statCell = ' ' + colorFor(v)(statPadded) + ' '

    const valuePadded = String(v).padStart(valueContentWidth)
    const valueCell = ' ' + colorFor(v)(valuePadded) + ' '

    // dice cell: include 3 spaces on either side and left-justify the dice string within content area
    const diceCell = ' '.repeat(3) + dice[i].padEnd(diceContentWidth) + ' '.repeat(3)
    return '│' + statCell + '│' + valueCell + '│' + diceCell + '│'
  })

  return `\`\`\`ansi
${top}
${header}
${mid}
${rows.join('\n')}
${bottom}
\`\`\`
`
}

export const makeRollStatsHandler = (db: RepositoryFactory): CommandHandlerFn => {
  const playerCharacterStatRolls = db.getRepository<PlayerCharacterStatRoll>('playerCharacterStatRolls')
  const players = db.getRepository<Player>('players')
  const pcs = db.getRepository<PlayerCharacter>('playerCharacters')

  const playerService = new DefaultPlayerService(players, pcs)
  const playerCharacterService = new DefaultPlayerCharacterService(pcs, playerCharacterStatRolls)

  return async (interaction) => {
    const { character: originalCharacter, player } = await playerService.getPlayerAndCharacter(interaction.user.id)

    if (interaction.user.displayName !== player.displayName) {
      await patchRecord(players, player.id, {
        displayName: interaction.user.displayName,
      })
    }

    const { results, isNew } = await playerCharacterService.rollStats(originalCharacter.id)

    const formatRolledAt = (iso?: string) => {
      if (!iso) return 'on unknown date'
      const d = new Date(iso)
      try {
        // Use America/Chicago to represent Central Time (handles DST)
        const date = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Chicago',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(d)

        // 12-hour clock with am/pm
        const time = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Chicago',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
          .format(d)
          .toLowerCase()

        return `on ${date} at ${time}`
      } catch {
        // Fallback to manual formatting if Intl timeZone not available
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        const yyyy = d.getFullYear()
        const hh24 = d.getHours()
        const period = hh24 >= 12 ? 'pm' : 'am'
        let hh12 = hh24 % 12
        if (hh12 === 0) hh12 = 12
        const min = String(d.getMinutes()).padStart(2, '0')
        return `on ${mm}/${dd}/${yyyy} at ${hh12}:${min} ${period}`
      }
    }

    const preamble =
      isNew ?
        `🎉 ${interaction.user.displayName} is creating a new character!`
      : `${interaction.user.displayName} rolled stats ${formatRolledAt(results.rolledAt)}:`

    await interaction.reply(`${preamble}\n${formatStats(results.rolls)}`)
  }
}
