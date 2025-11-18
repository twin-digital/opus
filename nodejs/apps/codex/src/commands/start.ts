import { Command, Flags } from '@oclif/core'
import type { OptionFlag } from '@oclif/core/interfaces'
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  type Interaction,
} from 'discord.js'

export default class Start extends Command {
  static override description = 'Run the Codex Discord bot'

  static override examples: string[] = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --region us-west-2',
  ]

  static override flags: {
    token: OptionFlag<string>
    'app-id': OptionFlag<string>
  } = {
    token: Flags.string({
      description: 'Discord bot token',
      env: 'DISCORD_TOKEN',
      required: true,
    }),
    'app-id': Flags.string({
      description: 'Discord application ID',
      env: 'DISCORD_APP_ID',
      required: true,
    }),
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(Start)

    this.log('Initializing Codex bot...')

    // Setup Discord bot
    const client = new Client({ intents: [GatewayIntentBits.Guilds] })

    // graceful shutdown helpers
    const logger = this.log.bind(this)
    let shuttingDown = false
    const shutdown = (signal: string) => {
      if (shuttingDown) return
      shuttingDown = true
      logger(`Received ${signal}, shutting down...`)
      try {
        // remove listeners and destroy the client
        try {
          client.removeAllListeners()
        } catch (e) {
          logger(`Error removing listeners: ${String(e)}`)
        }

        try {
          void client.destroy()
          logger('Discord client destroyed')
        } catch (e) {
          logger(`Error destroying client: ${String(e)}`)
        }
      } catch (err) {
        logger(`Error during shutdown: ${(err as Error).message}`)
      } finally {
        // Give libraries a little time to cleanup, then force exit
        setTimeout(() => {
          logger('Exiting process')
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

    const commands = [
      new SlashCommandBuilder().setName('greet').setDescription('Greet Codex'),
      // .addStringOption((o: any) =>
      //   o.setName('q').setDescription('Your question').setRequired(true),
      // ),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    ].map((c: any) => c.toJSON())

    // Register slash commands
    this.log('Registering slash commands...')
    const rest = new REST({ version: '10' }).setToken(flags.token)
    await rest.put(Routes.applicationCommands(flags['app-id']), {
      body: commands,
    })
    this.log('Slash commands registered')

    // Handle bot ready event
    client.on('clientReady', () => {
      this.log(`Bot logged in as ${client.user?.tag}`)
    })

    // Handle interactions
    client.on('interactionCreate', (interaction: Interaction) => {
      if (
        !interaction.isChatInputCommand() ||
        interaction.commandName !== 'greet'
      ) {
        return
      }

      void (async () => {
        // const question = interaction.options.getString('q', true)
        await interaction.deferReply({ ephemeral: true })

        try {
          this.log('Sending a greeting')
          await interaction.editReply('Hello!')
        } catch (error) {
          this.log(`Error answering question: ${(error as Error).message}`)
          await interaction.editReply(
            'Sorry—something went wrong retrieving that.',
          )
        }
      })()
    })

    // Login to Discord
    this.log('Logging into Discord...')
    await client.login(flags.token)
  }
}
