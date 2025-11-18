import { Client, GatewayIntentBits, type Message } from 'discord.js'
import { execute, type BotAction } from './action.js'

/**
 * Possibly handle a message. If this handler has a response, it will be returned as a `BotAction`. An undefined
 * result means the handler does not want to take an action.
 * @param message
 */
export type MessageHandlerFn = (
  message: Message,
) => BotAction | undefined | Promise<BotAction | undefined>

export interface BotBehavior {
  /**
   * Set of message handlers implemented by this behavior. When a message is received, each handler will be invoked in
   * turn. If any return a non-undefined result, that action will be invoked and further processing halted. If there are
   * more than one behaviors registered, each will be called in the same manner until a single one responds.
   */
  messageHandlers?: MessageHandlerFn[]
}

const registerShutdownHooks = (
  client: Client,
  log: (message?: string, ...args: unknown[]) => void,
) => {
  let shuttingDown = false

  const shutdown = (signal: string) => {
    if (shuttingDown) {
      return
    }

    shuttingDown = true
    log(`Received ${signal}, shutting down...`)
    try {
      // remove listeners and destroy the client
      try {
        client.removeAllListeners()
      } catch (e) {
        log(`Error removing listeners: ${String(e)}`)
      }

      try {
        void client.destroy()
        log('Discord client destroyed')
      } catch (e) {
        log(`Error destroying client: ${String(e)}`)
      }
    } catch (err) {
      log(`Error during shutdown: ${(err as Error).message}`)
    } finally {
      // Give libraries a little time to cleanup, then force exit
      setTimeout(() => {
        log('Exiting process')
        // exit with success; Docker will see the container stop
        process.exit(0)
      }, 25000).unref()
    }
  }

  process.on('SIGTERM', () => {
    shutdown('SIGTERM')
  })
  process.on('SIGINT', () => {
    shutdown('SIGINT')
  })
}

export const runBot = async ({
  appId: _appId,
  behaviors,
  log = () => {
    /* noop */
  },
  token,
}: {
  appId: string
  behaviors: BotBehavior[]
  log?: (message?: string, ...args: unknown[]) => void
  token: string
}): Promise<void> => {
  log('Initializing Codex bot...')

  // Setup Discord bot
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  })

  registerShutdownHooks(client, log)

  // Handle bot ready event
  client.on('clientReady', () => {
    log(`Bot logged in as ${client.user?.tag}`)
  })

  // Handle messages using the chat handler
  client.on('messageCreate', (message) => {
    if (message.author.bot) {
      // ignore bot messages
      return
    }

    void (async () => {
      try {
        for (const behavior of behaviors) {
          const messageHandlers = behavior.messageHandlers ?? []
          for (const messageHandler of messageHandlers) {
            const result = await messageHandler(message)
            if (result !== undefined) {
              await execute(result, {
                client,
                log,
              })
              return
            }
          }
        }
      } catch (error) {
        log(`Error handling message: ${(error as Error).message}`)
      }
    })()
  })

  // Login to Discord
  log('Logging into Discord...')
  await client.login(token)
}
