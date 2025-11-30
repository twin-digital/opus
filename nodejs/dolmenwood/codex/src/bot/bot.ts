import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Message,
} from 'discord.js'
import { execute, type BotAction } from './action.js'
import { consoleLogger, type Logger } from '../core/log.js'
import { castArray } from 'lodash-es'

export type CommandHandlerFn = (interaction: ChatInputCommandInteraction, client: Client) => void | Promise<void>

/**
 * Possibly handle a message. If this handler has a response, it will be returned as a `BotAction`. An undefined
 * result means the handler does not want to take an action.
 * @param message
 */
export type MessageHandlerFn = (
  message: Message,
) => BotAction | BotAction[] | undefined | Promise<BotAction | BotAction[] | undefined>

export interface BotBehavior {
  /**
   * Discord slash commands to register for this behavior. The key is the command name, and the value contains
   * the command description, handler function, and optional parameters.
   *
   * When a command is invoked, the corresponding handler will be called with the interaction object.
   */
  commands?: Record<
    string,
    {
      description: string
      handler: CommandHandlerFn
      options?: {
        description: string
        name: string
        required: boolean
      }[]
    }
  >

  /**
   * Set of message handlers implemented by this behavior. When a message is received, each handler will be invoked in
   * turn. If any return a non-undefined result, that action will be invoked and further processing halted. If there are
   * more than one behaviors registered, each will be called in the same manner until a single one responds.
   */
  messageHandlers?: MessageHandlerFn[]
}

const registerShutdownHooks = (client: Client, logger: Logger) => {
  let shuttingDown = false

  const shutdown = (signal: string) => {
    if (shuttingDown) {
      return
    }

    shuttingDown = true
    logger.info(`Received ${signal}, shutting down...`)
    try {
      // remove listeners and destroy the client
      try {
        client.removeAllListeners()
      } catch (e) {
        logger.error(`Error removing listeners: ${String(e)}`)
      }

      try {
        void client.destroy()
        logger.info('Discord client destroyed')
      } catch (e) {
        logger.error(`Error destroying client: ${String(e)}`)
      }
    } catch (err) {
      logger.error(`Error during shutdown: ${(err as Error).message}`)
    } finally {
      // Give libraries a little time to cleanup, then force exit
      setTimeout(() => {
        logger.info('Exiting process')
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
  appId,
  behaviors,
  log = consoleLogger,
  token,
}: {
  appId: string
  behaviors: BotBehavior[]
  log?: Logger
  token: string
}): Promise<void> => {
  log.info('Initializing Codex bot...')

  // Collect all commands from behaviors
  const commandMap = new Map<string, CommandHandlerFn>()
  const slashCommands: ReturnType<SlashCommandBuilder['toJSON']>[] = []

  for (const behavior of behaviors) {
    if (behavior.commands) {
      for (const [commandName, commandConfig] of Object.entries(behavior.commands)) {
        const builder = new SlashCommandBuilder().setName(commandName).setDescription(commandConfig.description)

        // Add options if specified
        if (commandConfig.options) {
          for (const option of commandConfig.options) {
            builder.addStringOption((opt) =>
              opt.setName(option.name).setDescription(option.description).setRequired(option.required),
            )
          }
        }

        slashCommands.push(builder.toJSON())
        commandMap.set(commandName, commandConfig.handler)
      }
    }
  }

  // Register slash commands with Discord API
  if (slashCommands.length > 0) {
    log.info(`Registering ${slashCommands.length} slash command(s)...`)
    const rest = new REST({ version: '10' }).setToken(token)
    try {
      await rest.put(Routes.applicationCommands(appId), { body: slashCommands })
      log.info('Successfully registered slash commands')
    } catch (error) {
      log.error(`Error registering slash commands: ${(error as Error).message}`)
    }
  }

  // Setup Discord bot
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  })

  registerShutdownHooks(client, log)

  // Handle bot ready event
  client.on('clientReady', () => {
    log.info(`Bot logged in as ${client.user?.tag}`)
  })

  // Handle slash command interactions
  client.on('interactionCreate', (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return
    }

    void (async () => {
      try {
        const handler = commandMap.get(interaction.commandName)
        if (handler) {
          await handler(interaction, client)
        } else {
          log.error(`No handler found for command: ${interaction.commandName}`)
          await interaction.reply('I encountered an error processing that command.')
        }
      } catch (error) {
        log.error(`Error handling interaction: ${(error as Error).message}`)

        if (!interaction.replied) {
          await interaction.reply('I encountered an error processing that command.')
        }
      }
    })()
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
              const actions = castArray(result)
              for (const action of actions) {
                await execute(action, {
                  client,
                  log: log.info.bind(log),
                })
              }
              return
            }
          }
        }
      } catch (error) {
        log.error(`Error handling message: ${(error as Error).message}`)
      }
    })()
  })

  // Login to Discord
  log.info('Logging into Discord...')
  await client.login(token)
}
