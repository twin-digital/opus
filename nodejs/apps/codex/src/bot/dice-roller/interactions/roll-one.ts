import { rollOne } from '../../../game/dice/roll.js'
import type { MessageHandlerFn } from '../../bot.js'

export const rollOneHandler: MessageHandlerFn = (message) => {
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
