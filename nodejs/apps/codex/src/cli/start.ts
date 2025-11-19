import { Command, Flags } from '@oclif/core'
import type { OptionFlag } from '@oclif/core/interfaces'
import { runBot } from '../bot/bot.js'
import { makeDiceRollerBehavior } from '../bot/dice-roller/behavior.js'
import { RepositoryCoordinator } from '../core/db/s3-repository/repository-coordinator.js'

export default class Start extends Command {
  static override description = 'Run the Codex Discord bot'

  static override examples: string[] = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --region us-west-2',
  ]

  static override flags: {
    'app-id': OptionFlag<string>
    diceChannelId: OptionFlag<string | undefined>
    repositoryBucket: OptionFlag<string>
    repositoryPrefix: OptionFlag<string | undefined>
    token: OptionFlag<string>
  } = {
    diceChannelId: Flags.string({
      description: 'ID of the Discord channel in which to respond to dice roll commands',
      env: 'CODEX_DICE_CHANNEL_ID',
      required: false,
    }),
    'app-id': Flags.string({
      description: 'Discord application ID',
      env: 'DISCORD_APP_ID',
      required: true,
    }),
    token: Flags.string({
      description: 'Discord bot token',
      env: 'DISCORD_TOKEN',
      required: true,
    }),
    repositoryBucket: Flags.string({
      description: 'S3 bucket for persisting bot data',
      env: 'CODEX_REPOSITORY_BUCKET',
      required: true,
    }),
    repositoryPrefix: Flags.string({
      description: 'S3 prefix in which to store bot data. S3 key will be "<PREFIX><APP_ID>.json"',
      default: '',
      env: 'CODEX_REPOSITORY_PREFIX',
      required: false,
    }),
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(Start)

    const log = this.log.bind(this)

    const logger = {
      error: this.log.bind(this),
      info: this.log.bind(this),
    }

    // Initialize the repository coordinator
    log('Loading bot data from S3...')
    const coordinator = new RepositoryCoordinator({
      bucket: flags.repositoryBucket,
      documentId: flags['app-id'],
      log: logger,
      prefix: flags.repositoryPrefix,
    })

    await coordinator.init()
    log('Bot data loaded')

    const diceChannelId = flags.diceChannelId
    const behaviors =
      diceChannelId === undefined ?
        []
      : [
          makeDiceRollerBehavior({
            channelIds: [diceChannelId],
            db: coordinator,
            log,
          }),
        ]

    await runBot({
      appId: flags['app-id'],
      behaviors,
      log: logger,
      token: flags.token,
    })

    // const commands = [
    //   new SlashCommandBuilder().setName('greet').setDescription('Greet Codex'),
    //   // .addStringOption((o: any) =>
    //   //   o.setName('q').setDescription('Your question').setRequired(true),
    //   // ),
    //   // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    // ].map((c: any) => c.toJSON())

    // Register slash commands
    // this.log('Registering slash commands...')
    // const rest = new REST({ version: '10' }).setToken(flags.token)
    // await rest.put(Routes.applicationCommands(flags['app-id']), {
    //   body: commands,
    // })
    // this.log('Slash commands registered')

    // Handle interactions
    // client.on('interactionCreate', (interaction: Interaction) => {
    //   if (
    //     !interaction.isChatInputCommand() ||
    //     interaction.commandName !== 'greet'
    //   ) {
    //     return
    //   }

    //   void (async () => {
    //     // const question = interaction.options.getString('q', true)
    //     await interaction.deferReply({ ephemeral: true })

    //     try {
    //       this.log('Sending a greeting')
    //       await interaction.editReply('Hello!')
    //     } catch (error) {
    //       this.log(`Error answering question: ${(error as Error).message}`)
    //       await interaction.editReply(
    //         'Sorry—something went wrong retrieving that.',
    //       )
    //     }
    //   })()
    // })
  }
}
