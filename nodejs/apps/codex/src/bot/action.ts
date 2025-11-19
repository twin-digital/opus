import { TextChannel, type Client } from 'discord.js'

export interface BaseBotAction {
  /**
   * Identifier for the action type
   */
  type: string
}

/**
 * Action which causes the bot to send a message to a specific channel.
 */
export interface CreateMessageAction extends BaseBotAction {
  type: 'create-message'

  /**
   * ID of the channel to which the message should be delivered.
   */
  channelId: string

  /**
   * Content of the message to send.
   */
  content: string
}

export type BotAction = CreateMessageAction

/**
 * Executes a single bot action.
 */
export const execute = async (
  action: BotAction,
  { client, log: _log }: { client: Client; log: (message?: string, ...args: unknown[]) => void },
): Promise<void> => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (action.type === 'create-message') {
    const channel = await client.channels.fetch(action.channelId)
    if (channel instanceof TextChannel) {
      await channel.send(action.content)
    }
  }
}
