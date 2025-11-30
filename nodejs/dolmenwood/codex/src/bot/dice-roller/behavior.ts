import type { BotBehavior, CommandHandlerFn, MessageHandlerFn } from '../bot.js'
import { makeRollStatsHandler } from './interactions/roll-stats.js'
import { rollOneHandler } from './interactions/roll-one.js'
import type { RepositoryFactory } from '../../core/db/repository-factory.js'

const guardInteractionHandler =
  (channelIds: string[]) =>
  (handler: CommandHandlerFn): CommandHandlerFn =>
  async (interaction, client) => {
    if (interaction.channel?.id && channelIds.includes(interaction.channel.id)) {
      await handler(interaction, client)
    }
  }

const guardMessageHandler =
  (channelIds: string[]) =>
  (handler: MessageHandlerFn): MessageHandlerFn =>
  (message) =>
    channelIds.includes(message.channel.id) ? handler(message) : undefined

export const makeDiceRollerBehavior = ({
  channelIds,
  db,
  log: _log,
}: {
  channelIds: string[]
  db: RepositoryFactory
  log: (message?: string, ...args: unknown[]) => void
}): BotBehavior => {
  return {
    commands: {
      stats: {
        description: 'Roll character stats, or print the previously rolled set.',
        handler: guardInteractionHandler(channelIds)(makeRollStatsHandler(db)),
      },
    },
    messageHandlers: [rollOneHandler].map(guardMessageHandler(channelIds)),
  }
}
