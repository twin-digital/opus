import { rollOne } from '../../dice/roll.js'
import type { BotBehavior, MessageHandlerFn } from '../bot.js'

export const makeDiceRollerBehavior = ({
  channelIds,
  log: _log,
}: {
  channelIds: string[]
  log: (message?: string, ...args: unknown[]) => void
}): BotBehavior => {
  const diceRollerMessageHandler: MessageHandlerFn = (message) => {
    if (channelIds.includes(message.channel.id)) {
      const result = rollOne(message.content)
      if (result.valid) {
        return {
          type: 'create-message',
          channelId: message.channel.id,
          content: `${message.author.username} rolled >>> ${result.output}`,
        }
      }

      return undefined
    }
  }

  return {
    messageHandlers: [diceRollerMessageHandler],
  }
}
